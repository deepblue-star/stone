const invalidTime=()=>new Error('请输入有效北京时间，开始时间不能晚于结束时间');
function validCalendar(year:number,month:number,day:number,hour:number,minute:number,second:number):boolean{
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>=1000&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=(days[month-1]??0)&&hour<=23&&minute<=59&&second<=59;
}
/** datetime-local has no timezone. Interpret the visible form value as Beijing, never browser local time. */
export function beijingInputToIso(value:string):string|null{
 if(!value)return null;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
 if(!match)throw invalidTime();
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]??0);
 if(!validCalendar(year,month,day,hour,minute,second))throw invalidTime();
 const date=new Date(`${value}+08:00`);
 if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1000||date.getUTCFullYear()>9999)throw invalidTime();
 return date.toISOString();
}
const beijingFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function formatBeijingTime(value:string|null|undefined):string{
 if(!value)return '—';
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
 if(!match||!validCalendar(Number(match[1]),Number(match[2]),Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6]))||Number(match[7]??0)>23||Number(match[8]??0)>59)return '—';
 const date=new Date(value);if(!Number.isFinite(date.getTime())||date.getUTCFullYear()<1000||date.getUTCFullYear()>9999)return '—';
 const parts=beijingFormatter.formatToParts(date),part=(key:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===key)?.value??'';
 return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
}
export function timeRange(from:string,to:string):{created_from:string|null;created_to:string|null}{
 const created_from=beijingInputToIso(from),created_to=beijingInputToIso(to);
 if(created_from&&created_to&&created_from>created_to)throw invalidTime();
 return {created_from,created_to};
}
