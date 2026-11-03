import { NextResponse } from 'next/server';
import { assertOrigin } from '@/lib/auth';
import { adminClient } from '@/lib/session';

export async function POST(request: Request) {
  await assertOrigin();
  if (Number(request.headers.get('content-length') || 0) > 4096) return new NextResponse(null,{status:413});
  const body = await request.json().catch(()=>null);
  if (!body || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string')
    return NextResponse.json({error:'INVALID_INVITE'},{status:400});
  const sb = await adminClient();
  const set = await sb.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
  if (set.error || !set.data.user) return NextResponse.json({error:'INVALID_INVITE'},{status:401});
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
