CREATE TABLE IF NOT EXISTS {{.table}} (
    site_id String,
    timestamp DateTime,
    visitor_id String,
    session_id String,
    event_name String,
    properties String,
    url String,
    title String,
    referrer String,
    duration_ms Int32,
    screen_width Int32,
    screen_height Int32,

    -- UTM
    utm_source String,
    utm_medium String,
    utm_campaign String,
    utm_term String,
    utm_content String,

    -- Ad Clicks
    gclid String,
    fbclid String,
    ttclid String,
    blclid String,
    bd_vid String,
    gdt_vid String,
    msclkid String,
    twclid String,
    clickid String,

    -- Parsed Geolocation
    ip String,
    country String,
    region String,
    city String,

    -- Parsed Device / OS / Browser
    user_agent String,
    device_type String,
    os_name String,
    os_version String,
    browser_name String,
    browser_version String,

    -- Additional fields
    language String,
    country_code String,
    device_brand String,
    device_model String,
    ip_asn Nullable(UInt32),
    ip_asn_name Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (site_id, event_name, timestamp, visitor_id, session_id);
