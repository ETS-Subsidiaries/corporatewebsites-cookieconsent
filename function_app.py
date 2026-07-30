import hashlib
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import urlsplit

import azure.functions as func
from azure.core.exceptions import AzureError, ResourceExistsError
from azure.data.tables import TableServiceClient


PROTOCOL_VERSION = 1
MAX_RECEIPT_BYTES = 8192
ALLOWED_ORIGINS_SETTING = 'CONSENT_ALLOWED_ORIGINS'
TABLE_NAME_SETTING = 'CONSENT_TABLE_NAME'
STORAGE_SETTING = 'CONSENT_STORAGE_CONNECTION_STRING'
DEFAULT_TABLE_NAME = 'ConsentReceipts'
RECEIPT_FIELDS = {
    'receiptId',
    'siteId',
    'purposeDecisions',
    'decisionSource',
    'locale',
    'clientDecisionAt',
    'noticeVersion',
    'runtimeVersion',
    'protocolVersion',
}
DECISION_SOURCES = {'accept', 'decline', 'withdraw', 'gpc'}
UUID4_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
SITE_ID_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')
LOCALE_PATTERN = re.compile(r'^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$')
NOTICE_VERSION_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
SEMVER_PATTERN = re.compile(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$')
TABLE_NAME_PATTERN = re.compile(r'^[A-Za-z][A-Za-z0-9]{2,62}$')

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


class ConsentRequestError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


class ConsentConfigurationError(Exception):
    pass


def _canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _utc_iso(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def _normalize_origin(value):
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ValueError('invalid origin')
    try:
        parsed = urlsplit(value.strip())
        port = parsed.port
    except ValueError as error:
        raise ValueError('invalid origin') from error
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise ValueError('invalid origin')
    host = parsed.hostname
    if not host or host.startswith('.') or '*' in host:
        raise ValueError('invalid origin')
    try:
        host = host.encode('idna').decode('ascii').lower()
    except UnicodeError as error:
        raise ValueError('invalid origin') from error
    scheme = parsed.scheme.lower()
    is_local = host in {'localhost', '127.0.0.1', '::1'}
    if scheme != 'https' and not (scheme == 'http' and is_local):
        raise ValueError('invalid origin')
    default_port = 443 if scheme == 'https' else 80
    host_part = f'[{host}]' if ':' in host and not host.startswith('[') else host
    return f'{scheme}://{host_part}' + (f':{port}' if port and port != default_port else '')


@lru_cache(maxsize=1)
def _allowed_origins():
    raw_value = os.environ.get(ALLOWED_ORIGINS_SETTING, '')
    try:
        configured = json.loads(raw_value)
    except json.JSONDecodeError as error:
        raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} must contain valid JSON.') from error
    if not isinstance(configured, dict) or not configured:
        raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} must be a non-empty object.')

    normalized = {}
    for site_id, origins in configured.items():
        if not isinstance(site_id, str) or not SITE_ID_PATTERN.fullmatch(site_id):
            raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} contains an invalid site ID.')
        if not isinstance(origins, list) or not origins:
            raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} origin values must be non-empty arrays.')
        try:
            normalized_origins = {_normalize_origin(origin) for origin in origins}
        except ValueError as error:
            raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} contains an invalid origin.') from error
        if len(normalized_origins) != len(origins):
            raise ConsentConfigurationError(f'{ALLOWED_ORIGINS_SETTING} contains duplicate origins.')
        normalized[site_id] = frozenset(normalized_origins)
    return normalized


@lru_cache(maxsize=1)
def _get_table_client():
    connection_string = os.environ.get(STORAGE_SETTING) or os.environ.get('AzureWebJobsStorage')
    if not connection_string:
        raise ConsentConfigurationError(
            f'{STORAGE_SETTING} or AzureWebJobsStorage must provide a Table Storage connection string.'
        )
    table_name = os.environ.get(TABLE_NAME_SETTING, DEFAULT_TABLE_NAME)
    if not TABLE_NAME_PATTERN.fullmatch(table_name):
        raise ConsentConfigurationError(f'{TABLE_NAME_SETTING} is not a valid Azure Table name.')
    try:
        service = TableServiceClient.from_connection_string(connection_string)
    except ValueError as error:
        raise ConsentConfigurationError('The Table Storage connection string is invalid.') from error
    service.create_table_if_not_exists(table_name=table_name)
    return service.get_table_client(table_name=table_name)


def _site_id_from_request(req):
    site_id = req.params.get('siteId', '')
    if not isinstance(site_id, str) or not SITE_ID_PATTERN.fullmatch(site_id):
        raise ConsentRequestError('invalid_site', 'A valid siteId query parameter is required.')
    return site_id


def _authorize_origin(site_id, origin):
    try:
        normalized_origin = _normalize_origin(origin)
    except ValueError as error:
        raise ConsentRequestError('origin_not_allowed', 'The requesting origin is not allowed.', 403) from error
    if normalized_origin not in _allowed_origins().get(site_id, frozenset()):
        raise ConsentRequestError('origin_not_allowed', 'The requesting origin is not allowed.', 403)
    return normalized_origin


def _parse_content_length(req):
    raw_length = req.headers.get('Content-Length')
    if raw_length is None:
        return None
    try:
        content_length = int(raw_length)
    except (TypeError, ValueError) as error:
        raise ConsentRequestError('invalid_request', 'Content-Length is invalid.') from error
    if content_length < 0:
        raise ConsentRequestError('invalid_request', 'Content-Length is invalid.')
    return content_length


def _normalize_uuid4(value):
    if not isinstance(value, str) or not UUID4_PATTERN.fullmatch(value):
        raise ConsentRequestError('invalid_request', 'receiptId must be a UUID v4.')
    return str(uuid.UUID(value))


def _normalize_locale(value):
    if not isinstance(value, str) or len(value) > 35 or not LOCALE_PATTERN.fullmatch(value):
        raise ConsentRequestError('invalid_request', 'locale must be a BCP 47 language tag.')
    parts = value.split('-')
    normalized = [parts[0].lower()]
    for part in parts[1:]:
        if len(part) == 2 or (len(part) == 3 and part.isdigit()):
            normalized.append(part.upper())
        elif len(part) == 4:
            normalized.append(part.title())
        else:
            normalized.append(part.lower())
    return '-'.join(normalized)


def _normalize_client_time(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        raise ConsentRequestError('invalid_request', 'clientDecisionAt must be an ISO 8601 timestamp.')
    candidate = value[:-1] + '+00:00' if value.endswith('Z') else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as error:
        raise ConsentRequestError('invalid_request', 'clientDecisionAt must be an ISO 8601 timestamp.') from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ConsentRequestError('invalid_request', 'clientDecisionAt must include a UTC offset.')
    return _utc_iso(parsed)


def _validate_receipt(payload, requested_site_id):
    if not isinstance(payload, dict) or set(payload) != RECEIPT_FIELDS:
        raise ConsentRequestError('invalid_request', 'The receipt contains unsupported or missing fields.')

    receipt_id = _normalize_uuid4(payload.get('receiptId'))
    site_id = payload.get('siteId')
    if not isinstance(site_id, str) or site_id != requested_site_id:
        raise ConsentRequestError('invalid_request', 'siteId does not match the requested site.')

    decisions = payload.get('purposeDecisions')
    if not isinstance(decisions, dict) or set(decisions) != {'analytics'} or type(decisions.get('analytics')) is not bool:
        raise ConsentRequestError('invalid_request', 'purposeDecisions must contain one boolean analytics decision.')

    source = payload.get('decisionSource')
    if source not in DECISION_SOURCES:
        raise ConsentRequestError('invalid_request', 'decisionSource is invalid.')
    if (source == 'accept') != decisions['analytics']:
        raise ConsentRequestError('invalid_request', 'decisionSource does not match the analytics decision.')

    locale = _normalize_locale(payload.get('locale'))
    client_decision_at = _normalize_client_time(payload.get('clientDecisionAt'))
    notice_version = payload.get('noticeVersion')
    if not isinstance(notice_version, str) or not NOTICE_VERSION_PATTERN.fullmatch(notice_version):
        raise ConsentRequestError('invalid_request', 'noticeVersion is invalid.')
    runtime_version = payload.get('runtimeVersion')
    if not isinstance(runtime_version, str) or len(runtime_version) > 64 or not SEMVER_PATTERN.fullmatch(runtime_version):
        raise ConsentRequestError('invalid_request', 'runtimeVersion must use semantic versioning.')
    if type(payload.get('protocolVersion')) is not int or payload['protocolVersion'] != PROTOCOL_VERSION:
        raise ConsentRequestError('unsupported_protocol', 'The consent protocol version is not supported.', 409)

    return {
        'receiptId': receipt_id,
        'siteId': site_id,
        'purposeDecisions': {'analytics': decisions['analytics']},
        'decisionSource': source,
        'locale': locale,
        'clientDecisionAt': client_decision_at,
        'noticeVersion': notice_version,
        'runtimeVersion': runtime_version,
        'protocolVersion': PROTOCOL_VERSION,
    }


def _parse_receipt(req, requested_site_id):
    content_type = req.headers.get('Content-Type', '').split(';', 1)[0].strip().lower()
    if content_type != 'application/json':
        raise ConsentRequestError('invalid_content_type', 'Content-Type must be application/json.')
    content_length = _parse_content_length(req)
    if content_length is not None and content_length > MAX_RECEIPT_BYTES:
        raise ConsentRequestError('request_too_large', 'The receipt exceeds the 8 KiB limit.', 413)
    body = req.get_body()
    if len(body) > MAX_RECEIPT_BYTES:
        raise ConsentRequestError('request_too_large', 'The receipt exceeds the 8 KiB limit.', 413)
    try:
        payload = json.loads(body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ConsentRequestError('invalid_request', 'The receipt must be valid JSON.') from error
    return _validate_receipt(payload, requested_site_id)


def _payload_hash(receipt, origin):
    evidence = {'origin': origin, 'receipt': receipt}
    return hashlib.sha256(_canonical_json(evidence).encode('utf-8')).hexdigest()


def _acknowledgement(receipt, server_received_at):
    return {
        'receiptId': receipt['receiptId'],
        'siteId': receipt['siteId'],
        'purposeDecisions': receipt['purposeDecisions'],
        'serverReceivedAt': _utc_iso(server_received_at),
    }


def _store_receipt(receipt, origin):
    table = _get_table_client()
    server_received_at = datetime.now(timezone.utc)
    payload_hash = _payload_hash(receipt, origin)
    entity = {
        'PartitionKey': receipt['siteId'],
        'RowKey': receipt['receiptId'],
        'AnalyticsAllowed': receipt['purposeDecisions']['analytics'],
        'DecisionSource': receipt['decisionSource'],
        'Locale': receipt['locale'],
        'ClientDecisionAt': receipt['clientDecisionAt'],
        'NoticeVersion': receipt['noticeVersion'],
        'RuntimeVersion': receipt['runtimeVersion'],
        'ProtocolVersion': receipt['protocolVersion'],
        'Origin': origin,
        'PayloadHash': payload_hash,
        'ServerReceivedAt': server_received_at,
    }
    try:
        table.create_entity(entity=entity)
        return _acknowledgement(receipt, server_received_at), 201
    except ResourceExistsError:
        existing = table.get_entity(
            partition_key=receipt['siteId'],
            row_key=receipt['receiptId'],
        )
        if existing.get('PayloadHash') != payload_hash:
            raise ConsentRequestError(
                'receipt_id_conflict',
                'The receipt ID has already been used with different content.',
                409,
            )
        existing_server_time = existing.get('ServerReceivedAt')
        if not isinstance(existing_server_time, datetime):
            raise ConsentConfigurationError('An existing receipt has invalid server metadata.')
        return _acknowledgement(receipt, existing_server_time), 200


def _cors_headers(origin, preflight=False):
    headers = {
        'Access-Control-Allow-Origin': origin,
        'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Vary': 'Origin',
    }
    if preflight:
        headers.update({
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '600',
        })
    return headers


def _json_response(payload, status, origin=None):
    headers = {
        'Cache-Control': 'no-store',
        'Cross-Origin-Resource-Policy': 'cross-origin',
    }
    if origin:
        headers.update(_cors_headers(origin))
    return func.HttpResponse(
        body=_canonical_json(payload),
        status_code=status,
        mimetype='application/json',
        headers=headers,
    )


def _error_response(error, origin=None):
    return _json_response(
        {'error': {'code': error.code, 'message': error.message}},
        error.status,
        origin,
    )


def _validate_preflight(req):
    requested_method = req.headers.get('Access-Control-Request-Method', '').upper()
    if requested_method and requested_method != 'POST':
        raise ConsentRequestError('invalid_preflight', 'The requested CORS method is not allowed.', 403)
    requested_headers = {
        header.strip().lower()
        for header in req.headers.get('Access-Control-Request-Headers', '').split(',')
        if header.strip()
    }
    if not requested_headers.issubset({'content-type'}):
        raise ConsentRequestError('invalid_preflight', 'The requested CORS headers are not allowed.', 403)


@app.route(route='consent-receipts', methods=['POST', 'OPTIONS'])
def consent_receipts(req: func.HttpRequest) -> func.HttpResponse:
    allowed_origin = None
    try:
        site_id = _site_id_from_request(req)
        allowed_origin = _authorize_origin(site_id, req.headers.get('Origin', ''))
        if req.method.upper() == 'OPTIONS':
            _validate_preflight(req)
            return func.HttpResponse(
                status_code=204,
                headers=_cors_headers(allowed_origin, preflight=True),
            )
        receipt = _parse_receipt(req, site_id)
        acknowledgement, status = _store_receipt(receipt, allowed_origin)
        return _json_response(acknowledgement, status, allowed_origin)
    except ConsentRequestError as error:
        return _error_response(error, allowed_origin)
    except ConsentConfigurationError:
        logging.exception('Consent receipt service configuration is invalid.')
        return _json_response(
            {'error': {'code': 'service_unavailable', 'message': 'Receipt logging is temporarily unavailable.'}},
            503,
            allowed_origin,
        )
    except AzureError:
        logging.exception('Consent receipt storage is unavailable.')
        return _json_response(
            {'error': {'code': 'service_unavailable', 'message': 'Receipt logging is temporarily unavailable.'}},
            503,
            allowed_origin,
        )
