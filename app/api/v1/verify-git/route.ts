import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: Request) {
  try {
    const { platform, token, username } = await req.json();

    if (!token) {
      return NextResponse.json({ success: false, verified: false, message: 'Token is required' }, { status: 400 });
    }

    const esc = (s: string) => s.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    if (platform === 'github') {
      const result = execSync(`curl -s -w "\\n%{http_code}" --connect-timeout 3 --max-time 5 -H "Authorization: token ${esc(token)}" https://api.github.com/user`, { timeout: 8000 });
      const parts = result.toString().trim().split('\n');
      const statusCode = parts.pop()?.trim() || '';
      const body = parts.join('\n');

      if (statusCode === '200') {
        let userData: Record<string, unknown> = {};
        try { userData = JSON.parse(body); } catch {}
        const login = (userData.login as string) || username;
        const email = (userData.email as string) || 'no public email';
        return NextResponse.json({
          success: true, verified: true,
          login, email,
          message: `Authenticated as ${login} (${email})`,
        });
      } else if (statusCode === '401') {
        return NextResponse.json({ success: true, verified: false, message: 'Invalid token or token expired' });
      } else {
        return NextResponse.json({ success: true, verified: false, message: `API returned status ${statusCode}` });
      }
    }

    if (platform === 'gitlab') {
      const result = execSync(`curl -s -w "\\n%{http_code}" --connect-timeout 3 --max-time 5 -H "PRIVATE-TOKEN: ${esc(token)}" https://gitlab.com/api/v4/user`, { timeout: 8000 });
      const parts = result.toString().trim().split('\n');
      const statusCode = parts.pop()?.trim() || '';
      const body = parts.join('\n');

      if (statusCode === '200') {
        let userData: Record<string, unknown> = {};
        try { userData = JSON.parse(body); } catch {}
        const login = (userData.username as string) || username;
        const email = (userData.email as string) || 'no public email';
        return NextResponse.json({
          success: true, verified: true,
          login, email,
          message: `Authenticated as ${login} (${email})`,
        });
      } else if (statusCode === '401') {
        return NextResponse.json({ success: true, verified: false, message: 'Invalid token or token expired' });
      } else {
        return NextResponse.json({ success: true, verified: false, message: `API returned status ${statusCode}` });
      }
    }

    if (platform === 'bitbucket') {
      const result = execSync(`curl -s -w "\\n%{http_code}" --connect-timeout 3 --max-time 5 -u "${esc(username || '')}:${esc(token)}" https://api.bitbucket.org/2.0/user`, { timeout: 8000 });
      const parts = result.toString().trim().split('\n');
      const statusCode = parts.pop()?.trim() || '';
      const body = parts.join('\n');

      if (statusCode === '200') {
        let userData: Record<string, unknown> = {};
        try { userData = JSON.parse(body); } catch {}
        const login = (userData.display_name as string) || (userData.username as string) || username;
        const email = (userData.email as string) || 'no public email';
        return NextResponse.json({
          success: true, verified: true,
          login, email,
          message: `Authenticated as ${login}`,
        });
      } else if (statusCode === '401') {
        return NextResponse.json({ success: true, verified: false, message: 'Invalid credentials' });
      } else {
        return NextResponse.json({ success: true, verified: false, message: `API returned status ${statusCode}` });
      }
    }

    return NextResponse.json({ success: false, verified: false, message: `Unknown platform: ${platform}` }, { status: 400 });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return NextResponse.json({ success: false, verified: false, message: err.message || 'Verification failed' }, { status: 500 });
  }
}
