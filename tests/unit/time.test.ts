import {describe,it,expect} from 'vitest';
import {beijingInputToIso,formatBeijingTime,timeRange} from '../../admin-web/src/time';
import {orderQuery} from '../../admin-web/src/order-model';
describe('explicit Beijing time',()=>{
 it('formats ISO dates in Asia/Shanghai independently of browser timezone',()=>{expect(formatBeijingTime('2026-10-22T01:02:03Z')).toBe('2026-10-22 09:02:03');expect(formatBeijingTime(null)).toBe('—');expect(formatBeijingTime('invalid')).toBe('—');});
 it('does not normalize impossible ISO calendar dates in the display',()=>{expect(formatBeijingTime('2026-02-30T01:00:00Z')).toBe('—');expect(formatBeijingTime('2026-02-29T01:00:00+08:00')).toBe('—');});
 it('parses datetime-local with explicit +08:00, including fractional seconds',()=>{expect(beijingInputToIso('2026-10-22T09:00')).toBe('2026-10-22T01:00:00.000Z');expect(beijingInputToIso('2026-10-22T09:00:01.123')).toBe('2026-10-22T01:00:01.123Z');expect(beijingInputToIso('')).toBe(null);expect(orderQuery({status:'',orderNo:'',from:'2026-10-22T09:00',to:''},null).created_from).toBe('2026-10-22T01:00:00.000Z');});
 it.each(['2026-02-29T09:00','2026-04-31T09:00','2026-01-01T24:00','2026-01-01T00:60','2026-01-01T00:00:60','2026-01-01T00:00:00.1234','1000-01-01T00:00','0999-12-31T23:59','2026-01-01'])('rejects invalid or out of range local date %s',value=>expect(()=>beijingInputToIso(value)).toThrow());
 it('accepts leap day and UTC year limits and rejects reversed intervals',()=>{expect(beijingInputToIso('2024-02-29T08:00')).toBe('2024-02-29T00:00:00.000Z');expect(beijingInputToIso('1000-01-01T08:00')).toBe('1000-01-01T00:00:00.000Z');expect(beijingInputToIso('9999-12-31T23:59')).toBe('9999-12-31T15:59:00.000Z');expect(()=>timeRange('2026-10-23T09:00','2026-10-22T09:00')).toThrow();});
});
