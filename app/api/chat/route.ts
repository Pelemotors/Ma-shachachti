import { readFile } from "node:fs/promises";
import { z } from "zod";
import { authorize,readState,budget,fail,ApiError,jsonBody } from "@/lib/server";
import { activeFacts, whatMatters, applyActions } from "@/lib/engine";
import { AgentOutput } from "@/lib/agent/schema";
import { nextDayStart } from "@/lib/time";
export const runtime="nodejs";export const maxDuration=60;
type OpenAIResponse={status?:string;output?:{content?:{type:string;text?:string}[]}[]};
function outputText(data:OpenAIResponse){return(data.output??[]).flatMap(x=>x.content??[]).filter(x=>x.type==="output_text").map(x=>x.text??"").join("").trim()}
function parseAgentOutput(text:string){return AgentOutput.parse(JSON.parse(text.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim()))}
function upstreamError(status:number,raw:string){let code="";try{code=JSON.parse(raw)?.error?.code??""}catch{}if(status===429&&code==="insufficient_quota")return new ApiError(503,"מכסת ה-AI הסתיימה כרגע. לא בוצעו שינויים; אפשר להמשיך ידנית או לנסות לאחר חידוש הקרדיט.");if(status===429)return new ApiError(429,"שירות ה-AI עמוס כרגע. לא בוצעו שינויים; אפשר לנסות שוב בעוד רגע.");if(status===401||status===403)return new ApiError(503,"חיבור ה-AI דורש תיקון בהגדרות השרת. לא בוצעו שינויים.");return new ApiError(502,"הסוכן לא הצליח לענות כרגע. לא בוצעו שינויים; אפשר לנסות שוב.")}
async function callAgent(model:string,instructions:string,input:unknown):Promise<{parsed:z.infer<typeof AgentOutput>;model:string}>{
 const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(22000),body:JSON.stringify({model,store:false,instructions,input:[{role:"user",content:JSON.stringify(input)}],text:{format:{type:"json_schema",name:"household_agent_output",strict:false,schema:z.toJSONSchema(AgentOutput)}},max_output_tokens:3500})});
 const raw=await response.text();if(!response.ok){console.error("OpenAI chat upstream error",{model,status:response.status,detail:raw.slice(0,1000)});throw upstreamError(response.status,raw)}
 let data:OpenAIResponse;try{data=JSON.parse(raw)}catch{throw new ApiError(502,"הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים.")}
 if(data.status!=="completed")throw new ApiError(502,"התשובה לא הושלמה. לא בוצעו שינויים; אפשר לנסות שוב.");const text=outputText(data);if(!text)throw new ApiError(502,"הסוכן לא החזיר תשובה. לא בוצעו שינויים.");
 try{return{parsed:parseAgentOutput(text),model}}catch(error){console.error("OpenAI agent payload parse failed",{model,error:error instanceof Error?error.message:"unknown",detail:text.slice(0,1000)});throw new ApiError(502,"הסוכן החזיר תשובה לא תקינה. לא בוצעו שינויים; אפשר לנסח שוב.")}
}
export async function POST(req:Request){try{
 const{db,userId}=await authorize(req);const body=z.object({message:z.string().trim().min(1).max(6000),contextTaskId:z.string().uuid().nullable().optional()}).parse(await jsonBody(req,20000));const{state,revision}=await readState(db,userId);
 if(!state.profile.aiConsent)throw new ApiError(403,"אפשר להפעיל עזרה אישית בהגדרות, לאחר הסכמה לשימוש במידע.");if(!process.env.OPENAI_API_KEY||!process.env.OPENAI_MODEL)throw new ApiError(503,"הסוכן עדיין לא מחובר. אפשר להוסיף ולנהל משימות ידנית.");
 await budget(userId,"chat",Number(process.env.AI_HOURLY_LIMIT)||30);const instructions=await readFile(process.cwd()+"/lib/agent/INSTRUCTIONS.he.md","utf8");const now=new Date();const context={now:now.toISOString(),endOfToday:nextDayStart(now,state.profile.timezone),profile:state.profile,facts:activeFacts(state),tasks:state.tasks.filter(t=>t.status!=="cancelled").slice(-200),shopping:state.shopping.filter(x=>!x.purchasedAt),reminders:state.reminders.filter(r=>r.status==="pending"),important:whatMatters(state).map(t=>t.id),contextTaskId:body.contextTaskId??null,history:state.messages.slice(-16)};
 const models=Array.from(new Set([process.env.OPENAI_MODEL,"gpt-5.6-luna"].filter(Boolean))) as string[];let parsed:z.infer<typeof AgentOutput>|null=null,lastError:unknown;for(const model of models){try{parsed=(await callAgent(model,instructions,{context,message:body.message})).parsed;break}catch(error){lastError=error;if(error instanceof ApiError&&(error.status===429||error.status===503))throw error}}
 if(!parsed)throw lastError??new ApiError(502,"הסוכן לא הצליח לענות כרגע.");if(parsed.confidence==="clarify")parsed.actions=[];if(parsed.actions.length)try{applyActions(state,parsed.actions,now,true)}catch{throw new ApiError(502,"לא הצלחתי להכין שינוי מדויק. אפשר לנסח שוב? לא בוצעו פעולות.")}
 return Response.json({...parsed,basedOnRevision:revision},{headers:{"Cache-Control":"no-store"}})
}catch(e){return fail(e)}}
