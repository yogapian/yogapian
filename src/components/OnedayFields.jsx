import S from '../styles.js';
import { FONT } from '../constants.js';
import { saleCandidates } from '../onedaySales.js';

// 추가·기존 출석 수정에 같은 선택 UI를 사용한다. 후보는 추천 순서이며 자동 선택하지 않는다.
export default function OnedayFields({form, setForm, sales=[], bookingId, date, name, lockedSaleId=null, memberLinked=false}) {
  const patch = changes => setForm(f => ({...f, ...changes}));
  const choices = (field, values, disabled=false) => <div style={{display:'flex',gap:6,marginBottom:12}}>{values.map(([value,label])=><button type="button" key={value} disabled={disabled} onClick={()=>patch({[field]:value})} style={{flex:1,padding:'9px 6px',borderRadius:8,border:'1px solid #d9d4ca',background:form[field]===value?'#eef5ee':'#faf8f5',color:form[field]===value?'#2e6e44':'#7a6e60',fontFamily:FONT,fontSize:12,fontWeight:form[field]===value?700:400,opacity:disabled?0.65:1}}>{label}</button>)}</div>;
  const option = s => <option key={s.id} value={s.id}>{s.date} · {s.memberName||'(이름 없음)'} · {s.amount.toLocaleString('ko-KR')}원 · {s.payment||'미지정'} · #{s.id}</option>;
  const candidates = saleCandidates(sales,{bookingId,name,date});
  const membership = saleCandidates(sales,{bookingId,name,date,membership:true});
  return <div style={{marginTop:12}}>
    <label style={S.lbl}>방문 경로</label>
    {choices('onedaySource',[['general','일반'],['obut','오붓']],!!lockedSaleId)}
    {form.onedaySource==='obut'?<div style={{fontSize:12,color:'#7a6e60',marginBottom:12}}>오붓은 출석만 기록합니다. 월말 입금액은 매출 탭에서 수기로 입력해주세요.</div>:form.onedaySource==='general'&&<>
      <label style={S.lbl}>이용 구분</label>
      {choices('onedayMode',[['standalone','원데이만 · 3만원'],['membership','월회원 등록 · 포함']],memberLinked)}
      {lockedSaleId?<div style={{fontSize:12,color:'#4a6a4a',marginBottom:10}}>원데이 매출 #{lockedSaleId} 연결됨 · {form.onedayMode==='membership'?'월회비 포함으로 합계에서 제외':'중복 생성 없음'}</div>:<>
        <label style={S.lbl}>기존 원데이 매출</label>
        <select style={{...S.inp,marginBottom:10}} value={form.saleAction} onChange={e=>patch({saleAction:e.target.value,onedaySaleId:''})}>
          <option value="new">{form.onedayMode==='membership'?'별도 원데이 매출 없음':'새 매출 등록 · 출석 확인 시 3만원'}</option>
          <option value="existing">이미 등록한 3만원 매출 연결</option>
        </select>
        {form.saleAction==='existing'&&<select aria-label="기존 원데이 매출 선택" style={{...S.inp,marginBottom:10}} value={form.onedaySaleId||''} onChange={e=>patch({onedaySaleId:e.target.value})}><option value="">날짜·이름·금액을 확인하고 선택</option>{candidates.map(option)}</select>}
        {form.saleAction==='new'&&form.onedayMode==='standalone'&&<><label style={S.lbl}>결제 방법</label>{choices('onedayPayment',[['카드','카드'],['현금','현금'],['네이버','네이버']])}{candidates.some(s=>s.memberName===name)&&<div style={{fontSize:12,color:'#9a6020',marginBottom:10}}>같은 이름의 기존 매출이 있습니다. 중복이면 위에서 기존 매출 연결을 선택해주세요.</div>}</>}
      </>}
      {form.onedayMode==='membership'&&<><label style={S.lbl}>월회원권 매출 연결</label><select style={S.inp} value={form.onedayMembershipSaleId||''} onChange={e=>patch({onedayMembershipSaleId:e.target.value})}><option value="">회원 등록 후 연결</option>{membership.map(option)}</select><div style={{fontSize:12,color:'#7a6e60',margin:'8px 0 12px'}}>월회원권 총액에 3만원이 포함됩니다. 연결된 원데이 매출은 기록을 남기고 합계에서 제외합니다.</div></>}
    </>}
  </div>;
}
