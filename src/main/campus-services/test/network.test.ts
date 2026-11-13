import { expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, safeStorage: {} }));
vi.mock('../../settings/prefs', () => ({ readSetting: vi.fn(), writeSetting: vi.fn() }));
import { parsePortal } from '../network';

it('按校园网关认证状态判断在线，不把代理的外网连通当作校园网认证成功', () => {
  expect(
    parsePortal(`<!--Dr.COMWebLoginID_1.htm--><script>uid='fixture';v4ip='10.20.1.8';</script>`),
  ).toEqual({ online: true, userIp: '10.20.1.8', acIp: null });
  expect(parsePortal(`uid='';v4ip='10.20.1.8';AC='10.128.255.142';`)).toEqual({
    online: false,
    userIp: '10.20.1.8',
    acIp: '10.128.255.142',
  });
  expect(parsePortal('<html>Internet connected</html>').online).toBe(false);
  expect(parsePortal(`v4ip='bad';AC='10.128.255.142evil';`).acIp).toBeNull();
});
