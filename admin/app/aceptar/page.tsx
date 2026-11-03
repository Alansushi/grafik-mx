'use client';
import { useEffect, useState } from 'react';

export default function AcceptInvite() {
  const [error,setError] = useState(false);
  useEffect(()=>{
    const params = new URLSearchParams(location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    history.replaceState(null,'',location.pathname);
    if (!access_token || !refresh_token) { setError(true); return; }
    fetch('/api/invite-session',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({access_token,refresh_token})})
      .then(r=>{if(!r.ok)throw new Error('invite');location.replace('/establecer-clave');})
      .catch(()=>setError(true));
  },[]);
  return <main className="auth"><div className="auth-card"><p className="eyebrow">INVITACIÓN</p><h1>Activando acceso</h1>
    <p>{error ? 'El enlace de invitación es inválido o venció. Solicita uno nuevo.' : 'Validando tu invitación…'}</p></div></main>;
}
