import type { Admin, TrustedIdentity } from '../../../contracts/src/index';
import type { AdminDAO } from '../dao/index';
import { AppError } from '../errors';

export class AdminAccessService {
  constructor(private readonly admins: AdminDAO) {}
  async requireEnabledAdmin(identity: TrustedIdentity): Promise<Admin> {
    if (identity.kind !== 'web' || identity.uid.length === 0) throw new AppError('UNAUTHORIZED', '需要有效的管理端会话');
    const admin = await this.admins.findEnabledByAuthUid(identity.uid);
    if (!admin) throw new AppError('FORBIDDEN', '没有管理员权限');
    return admin;
  }
}
