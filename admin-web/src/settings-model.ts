import type { JsonValue, SiteConfigKey, Banner, FeatureEntry } from '../../packages/contracts/src';
import { priceToCent } from './catalog-model';
import { moneyText, record } from './order-model';
export interface BannerDraft extends Omit<Banner,'sort_order'> { id:string; sort:string }
export interface RegionDraft {province_code:string;province_name:string;fee:string;sort:string;enabled:boolean}
export interface SettingsDraft {banners:BannerDraft[];serviceEnabled:boolean;wechat:string;qr:string;features:FeatureEntry[];regions:RegionDraft[];daily:string;referral:string}
export const configLabels:Record<SiteConfigKey,string>={home_banners:'首页轮播',customer_service:'客服设置',feature_entries:'功能入口',shipping_rules:'配送规则',payment_rules:'支付规则',points_rules:'积分规则'};
export const pageLinks=[{value:'/pages/home/index',label:'首页'},{value:'/pages/catalog/index',label:'好物目录'},{value:'/pages/diy/index',label:'DIY 工作台'},{value:'/pages/points/index',label:'积分中心'},{value:'/pages/contact/index',label:'联系客服'},{value:'/pages/profile/index',label:'个人中心'}];
export function emptyDraft():SettingsDraft {return {banners:[],serviceEnabled:false,wechat:'',qr:'',features:[],regions:[],daily:'0',referral:'0'};}
function invalid():never {throw new Error('配置结构或字段值无效，请核对后重试');}
const text=(v:unknown,max=512):v is string=>typeof v==='string'&&v.length<=max;
const file=(v:unknown):v is string=>text(v)&&v.startsWith('cloud://')&&v.length>8;
function int(value:unknown,min=0,max=4294967295):number {if(typeof value!=='string'&&typeof value!=='number')return invalid();const raw=typeof value==='string'?value.trim():value;if(typeof raw==='string'&&!/^-?\d+$/.test(raw))return invalid();const n=Number(raw);if(raw===''||!Number.isSafeInteger(n)||n<min||n>max)return invalid();return n;}
function storedInt(value:unknown,min=0,max=4294967295):number {if(typeof value!=='number')return invalid();return int(value,min,max);}
function exact(v:unknown,keys:string[]):Record<string,unknown> {if(!record(v)||Object.keys(v).length!==keys.length||keys.some(k=>!(k in v)))return invalid();return v;}
export function readDraft(key:SiteConfigKey,value:JsonValue):SettingsDraft {
 const d=emptyDraft();
 if(key==='home_banners') {if(!Array.isArray(value))return invalid();d.banners=value.map((v,i)=>{const r=exact(v,['image_file_id','link_type','link_value','sort_order']);if(!file(r.image_file_id)||(r.link_type!=='PAGE'&&r.link_type!=='NONE')||!text(r.link_value)||(r.link_type==='PAGE'?!r.link_value.startsWith('/pages/'):r.link_value!==''))return invalid();return {id:`saved-${i}`,image_file_id:r.image_file_id,link_type:r.link_type,link_value:r.link_value,sort:String(storedInt(r.sort_order,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER))};});}
 if(key==='customer_service'&&value!==null) {const r=exact(value,['wechat_id','qr_file_id']);if(!text(r.wechat_id,128)||!(r.qr_file_id===''||file(r.qr_file_id)))return invalid();d.serviceEnabled=true;d.wechat=r.wechat_id;d.qr=r.qr_file_id;}
 if(key==='feature_entries') {if(!Array.isArray(value))return invalid();const seen=new Set<string>();d.features=value.map(v=>{const r=exact(v,['key','enabled']);if(!text(r.key,64)||!/^[A-Z][A-Z0-9_]*$/.test(r.key)||typeof r.enabled!=='boolean'||seen.has(r.key))return invalid();seen.add(r.key);return {key:r.key,enabled:r.enabled};});}
 if(key==='shipping_rules') {const r=exact(value,['regions']);if(!Array.isArray(r.regions))return invalid();const seen=new Set<string>();d.regions=r.regions.map(v=>{const row=exact(v,['province_code','province_name','shipping_fee_cent','sort_order','enabled']);if(!text(row.province_code)||!/^[1-9]\d{5}$/.test(row.province_code)||seen.has(row.province_code)||!text(row.province_name,80)||!row.province_name.trim()||typeof row.enabled!=='boolean')return invalid();seen.add(row.province_code);return {province_code:row.province_code,province_name:row.province_name,fee:moneyText(storedInt(row.shipping_fee_cent,0,Number.MAX_SAFE_INTEGER)),sort:String(storedInt(row.sort_order,-2147483648,2147483647)),enabled:row.enabled};});}
 if(key==='payment_rules'&&exact(value,['payment_timeout_minutes']).payment_timeout_minutes!==5)return invalid();
 if(key==='points_rules') {const r=exact(value,['daily_check_in_points','referral_first_completed_order_points']);d.daily=String(storedInt(r.daily_check_in_points));d.referral=String(storedInt(r.referral_first_completed_order_points));}
 return d;
}
export function configValue(key:SiteConfigKey,d:SettingsDraft):JsonValue {
 let value:JsonValue;
 switch(key) {
 case 'home_banners':value=d.banners.map(r=>({image_file_id:r.image_file_id,link_type:r.link_type,link_value:r.link_type==='NONE'?'':r.link_value,sort_order:int(r.sort,-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)}));break;
 case 'customer_service':value=d.serviceEnabled?{wechat_id:d.wechat,qr_file_id:d.qr}:null;break;
 case 'feature_entries':value=d.features.map(r=>({key:r.key,enabled:r.enabled}));break;
 case 'shipping_rules':value={regions:d.regions.map(r=>({province_code:r.province_code,province_name:r.province_name,shipping_fee_cent:priceToCent(r.fee),sort_order:int(r.sort,-2147483648,2147483647),enabled:r.enabled}))};break;
 case 'payment_rules':value={payment_timeout_minutes:5};break;
 case 'points_rules':value={daily_check_in_points:int(d.daily),referral_first_completed_order_points:int(d.referral)};break;
 }
 readDraft(key,value);return value;
}
