"use client";
import { useEffect, useState } from "react";
import { authHeaders, supabase } from "@/lib/supabase-browser";

type U={id:string;email?:string;emailConfirmed:boolean;role:"user"|"admin";approved:boolean;createdAt:string};
export default function AdminPage(){
 const [users,setUsers]=useState<U[]>([]),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[error,setError]=useState(""),[ready,setReady]=useState(false);
 async function load(){const r=await fetch("/api/admin/users",{headers:await authHeaders()});if(!r.ok){setReady(false);return;}const d=await r.json();setUsers(d.users);setReady(true);}
 useEffect(()=>{void load()},[]);
 async function login(e:React.FormEvent){e.preventDefault();setError("");if(!supabase)return;const {error}=await supabase.auth.signInWithPassword({email,password});if(error){setError("פרטי הכניסה אינם נכונים.");return;}await load();}
 async function update(u:U,body:object){const r=await fetch("/api/admin/users",{method:"PATCH",headers:{...(await authHeaders()),"Content-Type":"application/json"},body:JSON.stringify({userId:u.id,...body})});if(!r.ok){setError("העדכון נכשל.");return;}await load();}
 if(!ready)return <main className="welcome"><div className="brand-mark">מ׳</div><h1>כניסת מנהל</h1><form className="panel stack" onSubmit={login}><label>אימייל<input type="email" dir="ltr" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>סיסמה<input type="password" dir="ltr" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary">כניסה לאדמין</button>{error&&<p className="error">{error}</p>}</form></main>;
 return <main className="onboarding"><h1>ניהול משתמשים</h1><section className="panel stack">{users.map(u=><div key={u.id} className="panel"><strong dir="ltr">{u.email}</strong><p>{u.role==="admin"?"מנהל":"משתמש"} · {u.approved?"מאושר":"ממתין"} · {u.emailConfirmed?"מייל מאושר":"מייל לא מאושר"}</p><div className="row">{!u.approved&&<button className="primary" onClick={()=>update(u,{approved:true,confirmEmail:true})}>אישור משתמש</button>}<button className="secondary" onClick={()=>update(u,{approved:!u.approved})}>{u.approved?"חסימה":"אישור"}</button><button className="secondary" onClick={()=>update(u,{role:u.role==="admin"?"user":"admin"})}>{u.role==="admin"?"הפוך למשתמש":"הפוך למנהל"}</button></div></div>)}</section>{error&&<p className="error">{error}</p>}</main>;
}
