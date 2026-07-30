import json
import os
import unittest
import uuid
from unittest.mock import patch

import azure.functions as func
from azure.core.exceptions import ResourceExistsError, ServiceRequestError

import function_app


SITE_ID = 'example-entity'
ORIGIN = 'https://www.example.com'


class FakeTable:
    def __init__(self, failure=None):
        self.entities = {}
        self.failure = failure
        self.create_calls = 0

    def create_entity(self, entity):
        self.create_calls += 1
        if self.failure:
            raise self.failure
        key = (entity['PartitionKey'], entity['RowKey'])
        if key in self.entities:
            raise ResourceExistsError('entity exists')
        self.entities[key] = dict(entity)

    def get_entity(self, partition_key, row_key):
        return self.entities[(partition_key, row_key)]


def receipt_payload(**overrides):
    payload = {
        'receiptId': str(uuid.uuid4()),
        'siteId': SITE_ID,
        'purposeDecisions': {'analytics': True},
        'decisionSource': 'accept',
        'locale': 'en-CA',
        'clientDecisionAt': '2026-07-30T14:00:00.000Z',
        'noticeVersion': '2026-07-30',
        'runtimeVersion': '1.0.0',
        'protocolVersion': 1,
    }
    payload.update(overrides)
    return payload


def http_request(
    method='POST',
    payload=None,
    site_id=SITE_ID,
    origin=ORIGIN,
    extra_headers=None,
    raw_body=None,
):
    headers = {'Origin': origin}
    if method == 'POST':
        headers['Content-Type'] = 'application/json'
    if extra_headers:
        headers.update(extra_headers)
    body = raw_body if raw_body is not None else (
        json.dumps(payload if payload is not None else receipt_payload()).encode('utf-8')
        if method == 'POST'
        else b''
    )
    return func.HttpRequest(
        method=method,
        url=f'https://receipts.test/api/consent-receipts?siteId={site_id}',
        headers=headers,
        params={'siteId': site_id},
        route_params={},
        body=body,
    )


def response_json(response):
    return json.loads(response.get_body().decode('utf-8'))


class ConsentFunctionTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(
            os.environ,
            {
                function_app.ALLOWED_ORIGINS_SETTING: json.dumps({
                    SITE_ID: [ORIGIN, 'https://example.com'],
                    'second-entity': ['https://second.example.com'],
                }),
                function_app.TABLE_NAME_SETTING: 'ConsentReceipts',
                'AzureWebJobsStorage': 'UseDevelopmentStorage=true',
            },
        )
        self.environment.start()
        function_app._allowed_origins.cache_clear()
        function_app._get_table_client.cache_clear()
        self.table = FakeTable()
        self.table_client = patch.object(function_app, '_get_table_client', return_value=self.table)
        self.table_client.start()

    def tearDown(self):
        self.table_client.stop()
        self.environment.stop()
        function_app._allowed_origins.cache_clear()
        function_app._get_table_client.cache_clear()

    def test_preflight_returns_exact_origin_cors(self):
        request = http_request(
            method='OPTIONS',
            extra_headers={
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            },
        )

        response = function_app.consent_receipts(request)

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], ORIGIN)
        self.assertEqual(response.headers['Access-Control-Allow-Methods'], 'POST, OPTIONS')
        self.assertEqual(response.headers['Access-Control-Allow-Headers'], 'Content-Type')
        self.assertEqual(response.headers['Vary'], 'Origin')
        self.assertNotIn('Access-Control-Allow-Credentials', response.headers)

    def test_unregistered_origin_receives_no_cors_grant(self):
        response = function_app.consent_receipts(
            http_request(origin='https://attacker.example')
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response_json(response)['error']['code'], 'origin_not_allowed')
        self.assertNotIn('Access-Control-Allow-Origin', response.headers)
        self.assertEqual(self.table.create_calls, 0)

    def test_created_receipt_stores_only_the_evidence_contract(self):
        payload = receipt_payload()

        response = function_app.consent_receipts(http_request(payload=payload))

        self.assertEqual(response.status_code, 201)
        acknowledgement = response_json(response)
        self.assertEqual(acknowledgement['receiptId'], payload['receiptId'])
        self.assertEqual(acknowledgement['siteId'], SITE_ID)
        self.assertEqual(acknowledgement['purposeDecisions'], {'analytics': True})
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], ORIGIN)

        entity = self.table.entities[(SITE_ID, payload['receiptId'])]
        self.assertEqual(
            set(entity),
            {
                'PartitionKey',
                'RowKey',
                'AnalyticsAllowed',
                'DecisionSource',
                'Locale',
                'ClientDecisionAt',
                'NoticeVersion',
                'RuntimeVersion',
                'ProtocolVersion',
                'Origin',
                'PayloadHash',
                'ServerReceivedAt',
            },
        )
        self.assertEqual(entity['Origin'], ORIGIN)
        self.assertEqual(entity['Locale'], 'en-CA')
        self.assertNotIn('UserAgent', entity)
        self.assertNotIn('IpAddress', entity)
        self.assertNotIn('PageUrl', entity)
        self.assertNotIn('Referrer', entity)

    def test_duplicate_is_idempotent_and_changed_payload_conflicts(self):
        payload = receipt_payload()

        first = function_app.consent_receipts(http_request(payload=payload))
        duplicate = function_app.consent_receipts(http_request(payload=payload))
        changed = dict(payload)
        changed['purposeDecisions'] = {'analytics': False}
        changed['decisionSource'] = 'decline'
        conflict = function_app.consent_receipts(http_request(payload=changed))

        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(
            response_json(first)['serverReceivedAt'],
            response_json(duplicate)['serverReceivedAt'],
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(response_json(conflict)['error']['code'], 'receipt_id_conflict')
        self.assertEqual(len(self.table.entities), 1)

    def test_invalid_payload_is_rejected_without_echoing_values(self):
        payload = receipt_payload(pageUrl='https://private.example/account/12345')

        response = function_app.consent_receipts(http_request(payload=payload))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response_json(response)['error']['code'], 'invalid_request')
        self.assertNotIn('private.example', response.get_body().decode('utf-8'))
        self.assertEqual(self.table.create_calls, 0)

    def test_source_must_match_the_analytics_decision(self):
        payload = receipt_payload(
            purposeDecisions={'analytics': False},
            decisionSource='accept',
        )

        response = function_app.consent_receipts(http_request(payload=payload))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response_json(response)['error']['code'], 'invalid_request')
        self.assertEqual(self.table.create_calls, 0)

    def test_query_and_payload_site_ids_must_match(self):
        response = function_app.consent_receipts(
            http_request(payload=receipt_payload(), site_id='second-entity', origin='https://second.example.com')
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response_json(response)['error']['code'], 'invalid_request')
        self.assertEqual(
            response.headers['Access-Control-Allow-Origin'],
            'https://second.example.com',
        )

    def test_oversized_body_is_rejected(self):
        response = function_app.consent_receipts(
            http_request(
                raw_body=b'{' + (b'x' * (function_app.MAX_RECEIPT_BYTES + 1)),
                extra_headers={'Content-Length': str(function_app.MAX_RECEIPT_BYTES + 2)},
            )
        )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response_json(response)['error']['code'], 'request_too_large')
        self.assertEqual(self.table.create_calls, 0)

    def test_storage_failure_returns_a_retryable_service_response(self):
        self.table_client.stop()
        failing_table = FakeTable(ServiceRequestError('storage unavailable'))
        self.table_client = patch.object(
            function_app,
            '_get_table_client',
            return_value=failing_table,
        )
        self.table_client.start()

        with patch.object(function_app.logging, 'exception'):
            response = function_app.consent_receipts(http_request())

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response_json(response)['error']['code'], 'service_unavailable')
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], ORIGIN)

    def test_invalid_origin_configuration_fails_closed(self):
        os.environ[function_app.ALLOWED_ORIGINS_SETTING] = '{"example-entity":["*"]}'
        function_app._allowed_origins.cache_clear()

        with patch.object(function_app.logging, 'exception'):
            response = function_app.consent_receipts(http_request())

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response_json(response)['error']['code'], 'service_unavailable')
        self.assertNotIn('Access-Control-Allow-Origin', response.headers)
        self.assertEqual(self.table.create_calls, 0)


if __name__ == '__main__':
    unittest.main()
