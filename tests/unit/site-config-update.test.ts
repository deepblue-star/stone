import { describe, expect, it, vi } from 'vitest';
import { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import type { AdminDAO } from '../../packages/backend/src/dao/admin-dao';
import type { SiteConfigDAO, SiteConfigRecord } from '../../packages/backend/src/dao/site-config-dao';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';

function fixture(enabled = true) {
  const rows = new Map<string, SiteConfigRecord>();
  const upsert = vi.fn(async (key: string, value: unknown, updatedBy: string | null) => {
    rows.set(key, { config_key: key, config_value: value, updated_at: '2026-10-22T00:00:00Z' });
    return updatedBy ? 1 : 0;
  });
  const findByKey = vi.fn(async (key: string) => rows.get(key) ?? null);
  const configs = { upsert, findByKey } as unknown as SiteConfigDAO;
  const admins = { findEnabledByAuthUid: vi.fn(async (uid: string) => enabled ? { id: '1', auth_uid: uid, display_name: '测试管理员' } : null) } as unknown as AdminDAO;
  const service = new SiteConfigService(configs, new AdminAccessService(admins));
  return { service, upsert, findByKey, rows };
}
const admin = { kind: 'web' as const, uid: 'trusted-admin' };
const region = { province_code: '440000', province_name: '广东省', shipping_fee_cent: 800, sort_order: 10, enabled: true };

describe('admin site configuration updates', () => {
  it('registers the thin update action and records only the trusted administrator', async () => {
    const f = fixture();
    const api = createBusinessApi({ siteConfigService: f.service, resolveIdentity: async () => admin, log() {} });
    const value = [{ key: 'DIY', enabled: true }];
    const response = await api({ action: 'updateSiteConfig', payload: { config_key: 'feature_entries', config_value: value }, uid: 'spoofed' }, {});
    expect(response).toMatchObject({ ok: true, data: { config_key: 'feature_entries', config_value: value, updated_at: '2026-10-22T00:00:00.000Z' } });
    expect(f.upsert).toHaveBeenCalledWith('feature_entries', value, 'trusted-admin');
  });
  it('saves all six existing configuration shapes and reads the normalized result', async () => {
    const f = fixture();
    const configurations = {
      home_banners: [{ image_file_id: 'cloud://dev/banner.png', link_type: 'PAGE', link_value: '/pages/diy/index', sort_order: 10 }],
      customer_service: { wechat_id: 'alpha_customer_service', qr_file_id: '' },
      feature_entries: [{ key: 'DIY', enabled: true }, { key: 'STANDARD', enabled: false }],
      shipping_rules: { regions: [region] },
      payment_rules: { payment_timeout_minutes: 5 },
      points_rules: { daily_check_in_points: 0, referral_first_completed_order_points: 50 },
    };
    for (const [config_key, config_value] of Object.entries(configurations)) {
      const response = await f.service.updateSiteConfig({ config_key, config_value }, admin);
      expect(response).toMatchObject({ config_key, config_value });
    }
    expect(f.upsert).toHaveBeenCalledTimes(6);
  });
  it('rejects native and anonymous callers and disabled administrators before writes', async () => {
    const f = fixture();
    const input = { config_key: 'payment_rules', config_value: { payment_timeout_minutes: 5 } };
    await expect(f.service.updateSiteConfig(input, { kind: 'wechat', openid: 'synthetic-native' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(f.service.updateSiteConfig(input, { kind: 'anonymous' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(f.upsert).not.toHaveBeenCalled();
    const disabled = fixture(false);
    await expect(disabled.service.updateSiteConfig(input, admin)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(disabled.upsert).not.toHaveBeenCalled();
  });
  it('rejects extra request fields and non-whitelisted keys before identity resolution', async () => {
    const f = fixture(); const identity = vi.fn(async () => admin);
    const api = createBusinessApi({ siteConfigService: f.service, resolveIdentity: identity, log() {} });
    for (const payload of [
      { config_key: 'merchant_private_key', config_value: 'must-not-store' },
      { config_key: 'feature_entries', config_value: [], updated_by: 'spoofed' },
      { config_key: 'payment_rules' },
    ]) expect(await api({ action: 'updateSiteConfig', payload }, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
    expect(identity).not.toHaveBeenCalled(); expect(f.upsert).not.toHaveBeenCalled();
  });
  it('accepts disabled provinces and the same uint32 boundary used by PointsService', async () => {
    const f = fixture();
    await expect(f.service.updateSiteConfig({ config_key: 'shipping_rules', config_value: { regions: [{ ...region, enabled: false }] } }, admin)).resolves.toMatchObject({ config_value: { regions: [{ ...region, enabled: false }] } });
    await expect(f.service.updateSiteConfig({ config_key: 'points_rules', config_value: { daily_check_in_points: 4294967295, referral_first_completed_order_points: 0 } }, admin)).resolves.toMatchObject({ config_key: 'points_rules' });
    await expect(f.service.updateSiteConfig({ config_key: 'points_rules', config_value: { daily_check_in_points: 4294967296, referral_first_completed_order_points: 0 } }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.upsert).toHaveBeenCalledTimes(2);
  });
  it('decodes valid stored JSON but reports corrupt stored schemas as CONFIG_INVALID', async () => {
    const f = fixture();
    const input = { config_key: 'payment_rules', config_value: { payment_timeout_minutes: 5 } };
    f.findByKey.mockResolvedValueOnce({ config_key: 'payment_rules', config_value: '{"payment_timeout_minutes":5}', updated_at: '2026-10-22T00:00:00Z' });
    await expect(f.service.updateSiteConfig(input, admin)).resolves.toMatchObject({ config_value: { payment_timeout_minutes: 5 } });
    for (const config_value of ['{"payment_timeout_minutes":30}', '{broken', { payment_timeout_minutes: 5, secret: 'must-not-return' }]) {
      f.findByKey.mockResolvedValueOnce({ config_key: 'payment_rules', config_value });
      await expect(f.service.updateSiteConfig(input, admin)).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
    }
  });
  it.each([
    ['shipping_rules', { regions: [region, region] }],
    ['shipping_rules', { regions: [{ ...region, shipping_fee_cent: -1 }] }],
    ['shipping_rules', { regions: [{ ...region, shipping_fee_cent: 1.5 }] }],
    ['shipping_rules', { regions: [{ ...region, province_code: '44' }] }],
    ['shipping_rules', { regions: [{ ...region, secret: 'must-not-store' }] }],
    ['payment_rules', { payment_timeout_minutes: 30 }],
    ['payment_rules', { payment_timeout_minutes: 5, merchant_key: 'must-not-store' }],
    ['points_rules', { daily_check_in_points: -1, referral_first_completed_order_points: 10 }],
    ['points_rules', { daily_check_in_points: 5.5, referral_first_completed_order_points: 10 }],
    ['points_rules', { daily_check_in_points: 0 }],
    ['feature_entries', [{ key: 'DIY', enabled: true }, { key: 'DIY', enabled: false }]],
    ['home_banners', [{ image_file_id: 'https://not-a-cloud-file', link_type: 'NONE', link_value: '', sort_order: 0 }]],
    ['home_banners', [{ image_file_id: 'cloud://dev/banner.png', link_type: 'PAGE', link_value: 'javascript:bad', sort_order: 0 }]],
    ['customer_service', { wechat_id: '客服', qr_file_id: '', private_key: 'must-not-store' }],
  ])('rejects invalid or credential-shaped %s without changing stored configuration', async (config_key, config_value) => {
    const f = fixture();
    await expect(f.service.updateSiteConfig({ config_key, config_value }, admin)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(f.upsert).not.toHaveBeenCalled();
  });
});
