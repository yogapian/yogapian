import test from 'node:test';
import assert from 'node:assert/strict';
import {newOnedayForm,onedayFields,isIncludedSale,saleCandidates,validateOnedayForm} from './onedaySales.js';
import {bookingToSnake,fromSnakeBooking,fromSnakeSale} from './db.js';

test('일반·오붓·월회비 포함 필드와 미분류 기존 데이터 호환',()=>{
  assert.equal(validateOnedayForm(newOnedayForm()),'');
  assert.equal(onedayFields({...newOnedayForm(),onedaySource:'obut',onedaySaleId:4}).onedaySaleId,null);
  const fields=onedayFields({...newOnedayForm(),onedayMode:'membership',onedaySaleId:'4',onedayMembershipSaleId:'8'});
  const round=fromSnakeBooking(bookingToSnake({id:1,...fields}));
  for(const [key,value] of Object.entries(fields))assert.equal(round[key],value);
  assert.equal(Object.hasOwn(bookingToSnake({id:1}),'oneday_source'),false);
  assert.equal(Object.hasOwn(fromSnakeBooking({id:1}),'onedaySource'),false);
  assert.ok(validateOnedayForm({...newOnedayForm(),saleAction:'existing'}));
});
test('기존 매출 후보는 금액·종류·중복 연결을 확인하고 이름이 같아도 자동 연결하지 않음',()=>{
  const base={type:'oneday',amount:30000,date:'2026-09-30',memberName:'김가람'};
  const rows=[{...base,id:1},{...base,id:2,onedayBookingId:20},{...base,id:3,amount:20000},{...base,id:4,onedayStatus:'included'},{...base,id:5,type:'new_member',amount:150000}];
  assert.deepEqual(saleCandidates(rows,{bookingId:10,name:'김가람'}).map(s=>s.id),[1]);
  assert.deepEqual(saleCandidates(rows,{membership:true}).map(s=>s.id),[5]);
  assert.equal(onedayFields(newOnedayForm()).onedaySaleId,null);
});
test('월회비 포함·자동 취소 매출은 기록을 보존하되 합계에서 제외',()=>{
  const rows=[{amount:30000,onedayStatus:'included'},{amount:30000,onedayStatus:'cancelled'},{amount:150000},{amount:30000,onedayStatus:'active'}];
  assert.equal(rows.filter(s=>!isIncludedSale(s)).reduce((n,s)=>n+s.amount,0),180000);
  assert.equal(fromSnakeSale({id:1,oneday_booking_id:2,oneday_auto:true,oneday_status:'included'}).onedayBookingId,2);
});
