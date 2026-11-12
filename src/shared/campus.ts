export const campus = {
  name: '广州理工学院',
  productName: 'Dela GZIST',
  appId: 'io.dela.gzist.desktop',
  repository: 'https://github.com/Yukk1o/dela-gzist',
  academicOrigin: 'https://jw.gzist.edu.cn',
  academicBase: 'https://jw.gzist.edu.cn/jwglxt',
  loginUrl: 'https://jw.gzist.edu.cn/sso/lyiotlogin',
  cookieDomain: 'gzist.edu.cn',
} as const;

export function isAcademicPage(value: string): boolean {
  const url = new URL(value);
  return (
    (url.origin === campus.academicOrigin ||
      url.origin === campus.academicOrigin.replace('https:', 'http:')) &&
    url.pathname.startsWith('/jwglxt/') &&
    !url.pathname.includes('/xtgl/login_')
  );
}

export function currentAcademicSemester(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}-1`;
  return `${year - 1}-${year}-${month <= 2 ? '1' : '2'}`;
}
