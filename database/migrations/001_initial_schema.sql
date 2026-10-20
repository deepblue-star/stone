-- Source: Feishu technology design revision 844, retrieved 2026-10-21.
-- Target: stone-d3gga4t2g2ffaedb6, MySQL 8.0. No destructive statements.

CREATE TABLE catalog_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  catalog_type ENUM('BEAD','ACCESSORY','STANDARD') NOT NULL COMMENT '目录类型：BEAD珠子、ACCESSORY配件、STANDARD标准商品；分类已有商品后不可修改',
  name VARCHAR(80) NOT NULL COMMENT '分类展示名称，例如水晶、隔珠、成品手串',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '同一目录类型内的显示顺序；数值越小越靠前',
  is_enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '前台启用标记：0不展示、1展示；控制DIY材料Tab或商城分类是否出现',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_category_list (catalog_type, is_deleted, is_enabled, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商品和DIY材料分类';

CREATE TABLE catalog_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  category_id BIGINT UNSIGNED NOT NULL COMMENT '所属分类ID，业务写入前校验catalog_categories存在、未删除且类型匹配',
  name VARCHAR(160) NOT NULL COMMENT '商品或材料名称，例如净体白水晶、14K包金隔珠',
  description TEXT NULL COMMENT '商品或材料说明',
  images JSON NULL COMMENT '商品公共图片的CloudBase云存储文件标识数组',
  spec_schema JSON NULL COMMENT '标准商品可选规格维度定义；例如碎石类型、颜色及其可选值；DIY材料可为空',
  is_on_sale TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '商品层上架标记：0下架、1上架；可购买时还需检查分类启用及所选SKU上架',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_item_category (category_id, is_deleted, is_on_sale, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='珠子、配件与标准商品的公共资料';

CREATE TABLE catalog_skus (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  item_id BIGINT UNSIGNED NOT NULL COMMENT '所属商品或材料ID，业务写入前校验catalog_items存在且未删除',
  spec_values JSON NULL COMMENT '该SKU对应的规格值；字段key来自catalog_items.spec_schema；没有通用规格时可为空',
  spec_signature CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '后端对标准商品规范化spec_values计算的SHA-256摘要；用于识别同商品重复规格；DIY材料可为空',
  diameter_mm DECIMAL(7,2) NULL COMMENT '珠子或配件直径，单位毫米；标准商品可为空',
  image_file_id VARCHAR(512) NULL COMMENT 'SKU图片的CloudBase云存储文件标识；为空时使用商品公共图片',
  price_cent BIGINT UNSIGNED NOT NULL COMMENT '当前现金销售单价，单位人民币分',
  points_exchange_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '积分兑换开关：0不可兑换、1可用积分兑换该SKU免费1颗的兑换券',
  points_cost INT UNSIGNED NULL COMMENT '兑换一张该SKU免费1颗兑换券所需积分；points_exchange_enabled=0时应为空',
  stock_total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '尚未售出的库存数量，包含待付款订单已预占数量',
  stock_reserved INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '待付款订单已预占数量；可用量为stock_total减stock_reserved；大于0时禁止下架或删除SKU及其父商品、父分类',
  is_on_sale TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'SKU层上架标记：0下架、1上架；可购买时还需检查所属商品和分类状态',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_sku_item (item_id, is_deleted, is_on_sale, id),
  KEY idx_sku_spec (item_id, spec_signature, is_deleted),
  KEY idx_sku_points_exchange (points_exchange_enabled, is_deleted, is_on_sale, id),
  CONSTRAINT ck_sku_stock CHECK (stock_total >= stock_reserved),
  CONSTRAINT ck_sku_points_cost CHECK (
    (points_exchange_enabled = 0 AND points_cost IS NULL) OR
    (points_exchange_enabled = 1 AND points_cost IS NOT NULL AND points_cost > 0)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='具体规格、现金售价、积分兑换配置与库存';

CREATE TABLE designs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  _openid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '设计所属用户OpenID；由服务端从可信小程序调用上下文取得',
  name VARCHAR(120) NOT NULL COMMENT '设计展示名称',
  current_version_no INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前已保存版本号；新建设计尚未保存时为0',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_design_owner (_openid, is_deleted, updated_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户设计作品';

CREATE TABLE design_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  design_id BIGINT UNSIGNED NOT NULL COMMENT '所属设计ID，业务写入前校验designs存在、未删除且属于当前用户',
  version_no INT UNSIGNED NOT NULL COMMENT '设计内从1开始递增的版本号；保存后内容不可变',
  components JSON NOT NULL COMMENT '按排列顺序保存珠子或配件数组；每项含sku_id及保存时属性快照；用户端优先显示当前SKU，当前资料缺失时快照仅用于兜底和对照',
  thumbnail_file_id VARCHAR(512) NULL COMMENT '本版本缩略图的CloudBase云存储文件标识',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；版本内容不修改，该字段用于逻辑删除等记录维护',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_design_version (design_id, version_no),
  KEY idx_version_design (design_id, is_deleted, version_no),
  CONSTRAINT ck_version_positive CHECK (version_no > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='不可变的已保存设计版本';

CREATE TABLE cart_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  _openid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '购物车所属用户OpenID；由服务端从可信小程序调用上下文取得',
  item_type ENUM('DESIGN','STANDARD') NOT NULL COMMENT '条目类型：DESIGN完整设计版本、STANDARD标准商品SKU',
  sku_id BIGINT UNSIGNED NULL COMMENT '标准商品SKU ID；设计条目为空',
  design_version_id BIGINT UNSIGNED NULL COMMENT '用户加入购物车时选定的设计版本ID；标准商品条目为空',
  quantity INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '购买数量；必须大于0',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除；订单创建成功时删除参与结算的条目；再次加入相同目标时恢复原记录',
  PRIMARY KEY (id),
  UNIQUE KEY uk_cart_design (_openid, design_version_id, is_deleted),
  UNIQUE KEY uk_cart_sku (_openid, sku_id, is_deleted),
  KEY idx_cart_owner (_openid, is_deleted, created_at, id),
  KEY idx_cart_sku (sku_id),
  KEY idx_cart_design_version (design_version_id),
  CONSTRAINT ck_cart_quantity CHECK (quantity > 0),
  CONSTRAINT ck_cart_target CHECK (
    (item_type = 'STANDARD' AND sku_id IS NOT NULL AND design_version_id IS NULL) OR
    (item_type = 'DESIGN' AND sku_id IS NULL AND design_version_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='标准商品或完整设计的购物车条目';

CREATE TABLE addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  _openid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '地址所属用户OpenID；由服务端从可信小程序调用上下文取得',
  receiver_name VARCHAR(80) NOT NULL COMMENT '收货人姓名',
  phone VARCHAR(32) NOT NULL COMMENT '收货联系电话；仅本人及必要的履约管理接口可读取',
  province_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '省级行政区代码；必须来自site_config.shipping_rules中已启用省份',
  province VARCHAR(80) NOT NULL COMMENT '省级行政区名称；保存时按province_code使用后端配置中的名称',
  city_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '市级行政区代码；来自小程序随版本发布的行政区划数据',
  city VARCHAR(80) NOT NULL COMMENT '市级行政区名称',
  district_code CHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '区县行政区代码；来自小程序随版本发布的行政区划数据',
  district VARCHAR(80) NOT NULL COMMENT '区县名称',
  address_line VARCHAR(255) NOT NULL COMMENT '详细收货地址',
  is_default TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '默认地址标记：0否、1是；Service在用户范围事务中保证每个用户仅一条未删除地址为默认',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_address_owner (_openid, is_deleted, is_default, id),
  KEY idx_address_province (_openid, province_code, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收货地址';

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  order_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '后端生成的永久唯一业务订单号；微信支付订单同时作为out_trade_no',
  _openid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '订单所属用户OpenID；由服务端从可信小程序调用上下文取得',
  checkout_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '一次提交订单操作的幂等键；用户小程序在确认页生成并持久化，重试时复用',
  checkout_request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '后端对结算目标、数量和地址等规范化请求计算的SHA-256十六进制摘要；用于校验同一checkout_key的请求内容',
  quote_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '订单预览返回的报价摘要；覆盖当前SKU价格、兑换券分配和运费，用于阻止静默提价',
  payment_mode ENUM('WECHAT','ZERO_PAY') NOT NULL COMMENT '支付方式：WECHAT调用微信支付；ZERO_PAY表示应付金额为0并在建单事务中直接进入待发货',
  status ENUM('PENDING_PAYMENT','READY_TO_SHIP','SHIPPED','COMPLETED','CLOSED') NOT NULL DEFAULT 'PENDING_PAYMENT' COMMENT '订单状态：待付款、待发货、已发货、已完成、已关闭',
  goods_amount_cent BIGINT UNSIGNED NOT NULL COMMENT '优惠前商品合计金额，单位人民币分；由后端按当前商品数据核算',
  discount_amount_cent BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '兑换券等优惠总额，单位人民币分',
  shipping_fee_cent BIGINT UNSIGNED NOT NULL COMMENT '运费，单位人民币分；由后端按运费规则核算',
  total_amount_cent BIGINT UNSIGNED NOT NULL COMMENT '应付总额，单位人民币分；等于商品合计减优惠再加运费',
  address_snapshot JSON NOT NULL COMMENT '下单时收货人、电话和完整地址快照；不随地址簿后续修改',
  payment_deadline_at DATETIME NULL COMMENT 'WECHAT订单完成支付的截止时间并对应微信time_expire；ZERO_PAY订单为空',
  paid_at DATETIME NULL COMMENT '微信回调或可信查单确认的支付完成时间；ZERO_PAY订单为空',
  carrier_name VARCHAR(80) NULL COMMENT '承运公司名称；一张订单对应一个包裹',
  tracking_no VARCHAR(80) NULL COMMENT '运单号；一张订单对应一个包裹',
  shipped_at DATETIME NULL COMMENT '商家确认发货时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  completed_at DATETIME NULL COMMENT '订单完成时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss；首个完成订单的邀请奖励以此状态转换为准',
  closed_at DATETIME NULL COMMENT '微信交易确认关闭且库存预占与兑换券锁定均释放完成的时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除；不参与支付状态补偿的过滤',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  UNIQUE KEY uk_checkout (_openid, checkout_key),
  KEY idx_order_owner (_openid, is_deleted, status, created_at),
  KEY idx_order_recent_payment (status, created_at),
  KEY idx_order_payment_deadline (status, payment_deadline_at),
  CONSTRAINT ck_order_amount CHECK (total_amount_cent = goods_amount_cent - discount_amount_cent + shipping_fee_cent),
  CONSTRAINT ck_order_discount CHECK (discount_amount_cent <= goods_amount_cent),
  CONSTRAINT ck_order_payment_mode CHECK (
    (payment_mode = 'WECHAT' AND total_amount_cent > 0 AND payment_deadline_at IS NOT NULL) OR
    (payment_mode = 'ZERO_PAY' AND total_amount_cent = 0 AND payment_deadline_at IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务订单、可信报价、支付方式、优惠总额及一单一包发货信息';

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  order_id BIGINT UNSIGNED NOT NULL COMMENT '所属业务订单ID；写入前由业务服务校验orders存在',
  item_type ENUM('DESIGN','STANDARD') NOT NULL COMMENT '项目类型：DESIGN完整设计、STANDARD标准商品',
  sku_id BIGINT UNSIGNED NULL COMMENT '标准商品成交SKU ID；设计项目为空',
  design_version_id BIGINT UNSIGNED NULL COMMENT '成交的固定设计版本ID；标准商品项目为空',
  quantity INT UNSIGNED NOT NULL COMMENT '成交数量；必须大于0',
  unit_price_cent BIGINT UNSIGNED NOT NULL COMMENT '优惠前成交单价，单位人民币分',
  gross_amount_cent BIGINT UNSIGNED NOT NULL COMMENT '优惠前项目金额，单位人民币分；等于成交单价乘数量',
  discount_amount_cent BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '分配到本订单项的兑换券优惠金额，单位人民币分',
  line_amount_cent BIGINT UNSIGNED NOT NULL COMMENT '优惠后项目成交金额，单位人民币分；等于优惠前金额减优惠',
  item_snapshot JSON NOT NULL COMMENT '成交时名称、规格、图片和材料计价明细；设计项目包含有序材料快照',
  promotion_snapshot JSON NULL COMMENT '成交时实际使用的coupon_id、sku_id、免费数量、当前单价和优惠金额快照',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  KEY idx_order_item_order (order_id, is_deleted, id),
  KEY idx_order_item_sku (sku_id),
  KEY idx_order_item_design_version (design_version_id),
  CONSTRAINT ck_order_item_quantity CHECK (quantity > 0),
  CONSTRAINT ck_order_item_gross CHECK (gross_amount_cent = unit_price_cent * quantity),
  CONSTRAINT ck_order_item_amount CHECK (line_amount_cent = gross_amount_cent - discount_amount_cent),
  CONSTRAINT ck_order_item_discount CHECK (discount_amount_cent <= gross_amount_cent),
  CONSTRAINT ck_order_item_target CHECK (
    (item_type = 'STANDARD' AND sku_id IS NOT NULL AND design_version_id IS NULL) OR
    (item_type = 'DESIGN' AND sku_id IS NULL AND design_version_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单项目、优惠分配与成交快照';

CREATE TABLE payment_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  order_id BIGINT UNSIGNED NOT NULL COMMENT '业务订单ID；写入前由业务服务校验orders存在',
  out_trade_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '微信支付商户订单号；固定使用orders.order_no，同一商户号下唯一且不复用',
  prepay_id VARCHAR(128) NULL COMMENT '微信JSAPI或小程序下单返回的预支付交易会话标识',
  transaction_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '微信支付订单号；支付成功后由回调或查单写入',
  trade_state VARCHAR(32) NULL COMMENT '微信支付交易状态；例如SUCCESS、NOTPAY、CLOSED；尚未查到时为空',
  success_time DATETIME NULL COMMENT '微信返回的支付完成时间；按UTC转换后存储，格式YYYY-MM-DD HH:mm:ss',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除；支付回调和补偿处理不得因该字段漏单',
  PRIMARY KEY (id),
  UNIQUE KEY uk_payment_order (order_id),
  UNIQUE KEY uk_out_trade_no (out_trade_no),
  UNIQUE KEY uk_transaction_id (transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信支付交易标识与状态';

CREATE TABLE payment_reconciliation_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；一次账单日期对应一条可重试执行记录',
  bill_date DATE NOT NULL COMMENT '对账账单日期；北京时间自然日',
  status ENUM('RUNNING','SUCCESS','PARTIAL','FAILED') NOT NULL COMMENT '执行状态：运行中、全部匹配、存在差异、执行失败',
  total_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '微信交易账单记录总数',
  matched_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '与本地支付记录一致的数量',
  issue_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '本次生成的未匹配或异常数量',
  started_at DATETIME NOT NULL COMMENT '任务开始时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  finished_at DATETIME NULL COMMENT '任务完成或失败时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  error_message VARCHAR(500) NULL COMMENT '任务级错误摘要；不保存商户私钥、Authorization或完整账单下载地址',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_reconciliation_bill_date (bill_date),
  KEY idx_reconciliation_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信支付日账单对账执行记录';

CREATE TABLE payment_reconciliation_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；管理端接口以字符串传输',
  run_id BIGINT UNSIGNED NOT NULL COMMENT '所属对账执行ID；写入前由Service校验payment_reconciliation_runs存在',
  issue_type ENUM('WECHAT_SUCCESS_LOCAL_PENDING','LOCAL_SUCCESS_WECHAT_MISSING','AMOUNT_MISMATCH','TRANSACTION_ID_MISMATCH','OTHER') NOT NULL COMMENT '差异类型',
  order_id BIGINT UNSIGNED NULL COMMENT '能匹配到的本地订单ID；无法匹配时为空',
  order_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '本地业务订单号快照',
  out_trade_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '微信商户订单号；用于定位本地支付记录',
  transaction_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '微信支付订单号',
  local_status VARCHAR(32) NULL COMMENT '对账时本地订单或支付状态快照',
  wechat_trade_state VARCHAR(32) NULL COMMENT '微信账单或补充查单得到的状态',
  local_amount_cent BIGINT UNSIGNED NULL COMMENT '本地应付金额，单位人民币分',
  wechat_amount_cent BIGINT UNSIGNED NULL COMMENT '微信账单金额，单位人民币分',
  resolution_status ENUM('OPEN','RESOLVED','IGNORED') NOT NULL DEFAULT 'OPEN' COMMENT '管理端处理状态：待处理、已解决、确认忽略',
  resolution_note VARCHAR(500) NULL COMMENT '管理员处理说明',
  resolved_by VARCHAR(64) COLLATE utf8mb4_bin NULL COMMENT '处理该异常的可信管理员UID',
  resolved_at DATETIME NULL COMMENT '管理员处理时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_reconciliation_issue (run_id, issue_type, out_trade_no),
  KEY idx_reconciliation_issue_status (resolution_status, created_at),
  KEY idx_reconciliation_issue_order (order_id),
  KEY idx_reconciliation_issue_out_trade_no (out_trade_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='微信账单与本地支付记录的对账差异及管理端处理结果';

CREATE TABLE order_stock_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  order_id BIGINT UNSIGNED NOT NULL COMMENT '业务订单ID；写入前由业务服务校验orders存在',
  sku_id BIGINT UNSIGNED NOT NULL COMMENT '被预占的SKU ID；写入前由业务服务校验catalog_skus存在',
  quantity INT UNSIGNED NOT NULL COMMENT '该订单汇总后的SKU预占数量；必须大于0',
  status ENUM('RESERVED','CONSUMED','RELEASED') NOT NULL DEFAULT 'RESERVED' COMMENT '预占状态：RESERVED待付款预占、CONSUMED支付后扣减、RELEASED关单后释放',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除；状态转换完成后仍保留记录',
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_sku (order_id, sku_id),
  KEY idx_reservation_sku (sku_id, status),
  KEY idx_reservation_order (order_id, status),
  CONSTRAINT ck_reservation_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='按订单和SKU汇总的库存预占';

CREATE TABLE inventory_movements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  event_key VARCHAR(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '库存事件永久幂等键；由动作、订单或管理操作标识和SKU组成',
  sku_id BIGINT UNSIGNED NOT NULL COMMENT '发生变化的SKU ID；写入前由业务服务校验catalog_skus存在',
  order_id BIGINT UNSIGNED NULL COMMENT '相关业务订单ID；管理员调整库存时为空',
  action ENUM('ADMIN_ADJUST','RESERVE','CONSUME','RELEASE') NOT NULL COMMENT '动作：管理员调整、订单预占、付款消耗、关单释放',
  stock_delta INT NOT NULL DEFAULT 0 COMMENT '本次stock_total变动量；增加为正、减少为负',
  reserved_delta INT NOT NULL DEFAULT 0 COMMENT '本次stock_reserved变动量；增加为正、减少为负',
  operator_uid VARCHAR(64) COLLATE utf8mb4_bin NULL COMMENT '管理员调整时记录可信CloudBase认证UID；系统订单动作为空',
  remark VARCHAR(255) NULL COMMENT '库存调整原因或业务说明',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；库存流水原则上不可修改',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除；库存流水原则上不执行删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_inventory_event (event_key),
  KEY idx_inventory_sku (sku_id, created_at),
  KEY idx_inventory_order (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='库存调整、预占、扣减和释放的审计流水';

CREATE TABLE points_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；积分流水、邀请关系和兑换券统一引用该账户ID',
  _openid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT '账户所属用户OpenID；由服务端从可信小程序调用上下文取得',
  balance BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '当前可用积分余额',
  total_earned BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计获得积分；不因后续消费减少',
  total_spent BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计用于兑换的积分总额；不随签到或邀请奖励增加而减少',
  invite_code CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '对外分享和手工填写使用的4位大写字母/数字随机邀请码；不暴露OpenID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_points_account_openid (_openid),
  UNIQUE KEY uk_points_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户积分账户和邀请码';

CREATE TABLE points_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输',
  account_id BIGINT UNSIGNED NOT NULL COMMENT '积分账户ID；写入前由业务服务校验points_accounts存在',
  points_delta BIGINT NOT NULL COMMENT '本次积分变动；签到、邀请奖励或退回为正，积分兑换为负，不能为0',
  balance_after BIGINT UNSIGNED NOT NULL COMMENT '该事件提交后的账户余额，便于审计',
  source_type VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '来源类型；包括DAILY_CHECK_IN、REFERRAL_FIRST_COMPLETED_ORDER、POINTS_EXCHANGE、POINTS_EXCHANGE_REFUND',
  event_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '业务事件永久幂等键；同一签到、订单奖励、兑换或兑换券退款只能写入一次',
  source_ref VARCHAR(128) NULL COMMENT '相关订单号、兑换券ID或管理操作标识',
  description VARCHAR(255) NOT NULL COMMENT '面向用户和管理员的积分变动说明',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；流水原则上不可修改',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记；积分流水原则上不删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_points_event (event_key),
  KEY idx_points_account_time (account_id, created_at, id),
  CONSTRAINT ck_points_delta_nonzero CHECK (points_delta <> 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分增减和幂等审计流水';

CREATE TABLE referral_relations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输',
  inviter_account_id BIGINT UNSIGNED NOT NULL COMMENT '分享人的积分账户ID',
  invitee_account_id BIGINT UNSIGNED NOT NULL COMMENT '被分享人的积分账户ID；一个账户最多绑定一个分享人',
  bind_channel ENUM('SHARE_PATH','MANUAL_CODE') NOT NULL COMMENT '绑定入口：小程序分享路径或手工填写邀请码',
  invite_code_snapshot CHAR(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '绑定时使用的邀请码副本，用于审计',
  rewarded_order_no VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '触发奖励的被分享人第一笔COMPLETED订单号；未奖励时为空',
  rewarded_at DATETIME NULL COMMENT '首单完成积分奖励提交时间；按UTC存储',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '关系绑定时间；按UTC存储',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记；绑定关系建立后保持有效，用户侧不提供解除或覆盖操作',
  PRIMARY KEY (id),
  UNIQUE KEY uk_referral_invitee (invitee_account_id),
  UNIQUE KEY uk_referral_reward_order (rewarded_order_no),
  KEY idx_referral_inviter (inviter_account_id, is_deleted, created_at),
  CONSTRAINT ck_referral_not_self CHECK (inviter_account_id <> invitee_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一级邀请绑定及首个完成订单奖励';

CREATE TABLE user_sku_coupons (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；一行代表指定SKU免费1颗的兑换券',
  account_id BIGINT UNSIGNED NOT NULL COMMENT '兑换券所属积分账户ID',
  sku_id BIGINT UNSIGNED NOT NULL COMMENT '可免费使用1颗的具体SKU；名称、图片、规格和当前价格实时查询catalog_skus与catalog_items',
  source_type VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '发券来源；当前为POINTS_EXCHANGE，字符串类型便于扩展新的积分赠送来源',
  source_ref VARCHAR(128) NULL COMMENT '来源业务标识，例如积分兑换请求键',
  points_cost_snapshot INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '生成该券时实际扣除的积分；退款按此值计算，不随catalog_skus.points_cost后续变化',
  event_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '发券事件永久幂等键；同一次积分兑换只生成一张券',
  status ENUM('AVAILABLE','LOCKED','USED','REFUNDED') NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE可试用和下单、LOCKED被待付款订单占用、USED支付成功后已核销、REFUNDED对应积分已退回',
  locked_order_id BIGINT UNSIGNED NULL COMMENT 'LOCKED状态对应业务订单ID；其他状态为空',
  locked_at DATETIME NULL COMMENT '创建待付款订单时锁券时间；按UTC存储',
  used_order_id BIGINT UNSIGNED NULL COMMENT 'USED状态对应业务订单ID；支付成功后写入',
  used_at DATETIME NULL COMMENT '支付成功核销时间；按UTC存储',
  refunded_at DATETIME NULL COMMENT 'SKU下架或删除后退回积分的完成时间；按UTC存储',
  refund_reason VARCHAR(255) NULL COMMENT '积分退回原因，例如SKU下架或逻辑删除',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记；状态变化不通过删除表达',
  PRIMARY KEY (id),
  UNIQUE KEY uk_sku_coupon_event (event_key),
  KEY idx_coupon_account_status (account_id, status, is_deleted, sku_id, id),
  KEY idx_coupon_sku_status (sku_id, status, is_deleted),
  KEY idx_coupon_locked_order (locked_order_id),
  KEY idx_coupon_used_order (used_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户持有的指定SKU免费1颗兑换券';

CREATE TABLE admin_allowlist (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键；接口以字符串传输，避免JavaScript整数精度丢失',
  auth_uid VARCHAR(64) COLLATE utf8mb4_bin NOT NULL COMMENT 'CloudBase身份认证用户UID；密码由CloudBase身份认证管理，本表不保存密码',
  display_name VARCHAR(80) NOT NULL COMMENT '管理员展示名称',
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '管理权限开关：0停用、1启用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_uid (auth_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家管理端应用管理员白名单';

CREATE TABLE site_config (
  config_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT '配置键，例如home_banners、customer_service、feature_entries、shipping_rules、payment_rules、points_rules',
  config_value JSON NOT NULL COMMENT '配置内容；每种配置键使用固定JSON结构并由业务后端校验',
  updated_by VARCHAR(64) COLLATE utf8mb4_bin NULL COMMENT '最近修改配置的可信管理员UID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间；按UTC存储，格式YYYY-MM-DD HH:mm:ss',
  is_deleted TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '逻辑删除标记：0正常、1已删除',
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='首页Banner、客服、功能入口、配送、支付时限和积分规则等站点配置';
