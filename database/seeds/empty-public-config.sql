-- Valid empty configuration only; do not invent merchant data or overwrite existing settings.
INSERT INTO site_config(config_key,config_value,created_at,updated_at) VALUES
('home_banners',JSON_ARRAY(),UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('customer_service',CAST('null' AS JSON),UTC_TIMESTAMP(),UTC_TIMESTAMP()),
('feature_entries',JSON_ARRAY(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE config_key=site_config.config_key;
