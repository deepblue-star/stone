# 开发测试素材

quartz-bracelet-generated.png 为 AI 生成的虚构白水晶手串图片，用于开发环境上传、商品缩略图及详情展示验证，不代表真实库存、材质或商家商品。

生成方式：内置 image_gen，2026-10-21。

Prompt：Square product catalog photograph of one elastic bracelet made entirely of clear white quartz spherical beads, arranged as an oval on warm off-white textured paper. Macro photography, soft daylight, realistic mineral inclusions. No charms, props, people, text, logo or watermark. Fictional development product imagery.

## DIY 单颗材料测试图（2026-10-22）

以下均使用内置 image_gen 生成，保留透明背景，只用于明确标注的 Alpha 样例，不代表真实商家材料。整串图片不能充当画布中的一颗珠子。

| 文件 | 用途 |
| --- | --- |
| white-quartz-bead-generated.png | 白水晶样例的 6/8/10mm SKU 共用单颗外观，排列尺寸由 SKU 珠径计算 |
| strawberry-quartz-bead-generated.png | 草莓晶样例的 8/10mm SKU |
| gold-spacer-bead-generated.png | 金色隔珠样例的 4mm SKU |

三次生成的共同 Prompt：`Use case: product-mockup. Asset: one standalone bead sprite for a DIY bracelet editor, fictional development sample. Exactly ONE bead, viewed straight on with a subtle central drill hole and restrained softbox highlight. Centered sphere fills 90 percent of a square canvas with tiny even padding; fully transparent alpha background, no cast shadow outside sphere, no floor, no hands, no string, no other beads, no bracelet, no text, no watermark. Photorealistic isolated product cutout, readable at 24–40 pixels.`

各图材料限定分别为：`transparent white quartz with delicate cloudy mineral inclusions`、`translucent pale rose strawberry quartz with tiny darker red mineral flecks`、`warm yellow gold with subtle brushed metal texture`。

已上传开发环境的 `catalog/alpha-20261022/`。`scripts/seed-alpha-material-images.ts` 默认只预览，`--apply` 仅把仍使用原整串占位图的指定 Alpha 材料改为单颗图；人工修改过的图片保留，不调整价格、积分规则或库存。云存储读取权限保持原配置。

## 标品第二视角测试图（2026-10-22）

`quartz-bracelet-alternate-generated.png` 为内置image_gen参照原`quartz-bracelet-generated.png`生成的另一张测试商品图，保留同一类白水晶、单圈手串、无配件的外观，改变拍摄视角。上传到开发环境`catalog/alpha-20261022/quartz-bracelet-alternate.png`，用于Alpha标品的多图浏览及规格联动检查，也用作空首页Banner的初始化素材。原图保留；本图不代表真实商家商品。

Prompt：`Use case: product-mockup. Edit target is the original fictional clear quartz bracelet product photo. Create a second catalog photograph of the SAME single intact clear white quartz spherical-bead elastic bracelet, same transparent cloudy mineral material and bead count, no charms or new components. Change only camera/composition to a close three-quarter angle from the opposite side on the same warm off-white textured paper, gentle daylight and realistic mineral inclusions. Keep the whole bracelet visible in a square photograph with safe margin; no clipping, no hands, no people, no text, no logo, no watermark. This is a clearly documented AI development test image, not an actual merchant product claim.`
