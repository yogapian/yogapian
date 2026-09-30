import { useState } from 'react';
import { FONT } from '../constants.js';
import { fmtWithDow } from '../utils.js';
import { newOnedayForm, onedayFields, validateOnedayForm } from '../onedaySales.js';
import OnedayFields from './OnedayFields.jsx';
import S from '../styles.js';

// 원데이는 회원 카드 대신 이름을 눌러 방문 경로·매출 연결을 관리한다.
export default function OnedayDetailModal({rec,bookings,members,sales=[],onedayReady,setBookings,onClose}) {
  const live=bookings.find(b=>b.id===rec.id);
  const [form,setForm]=useState(()=>({...newOnedayForm(),...rec,onedaySource:rec.onedaySource||'',onedayMode:rec.onedayMode||'standalone',saleAction:rec.onedaySaleId?'existing':'new'}));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [linkMode,setLinkMode]=useState(false);
  const [search,setSearch]=useState('');
  const close=()=>{if(!busy)onClose();};
  async function save(memberId=null) {
    if(busy||!live||live.id<0)return;
    const issue=validateOnedayForm(form);
    if(issue){setError(issue);return;}
    setBusy(true);setError('');
    const fields=onedayFields(form);
    const ok=await setBookings(p=>p.map(b=>b.id===rec.id?{...b,...fields,...(memberId?{memberId,onedayName:null,...(fields.onedaySource==='general'?{onedayMode:'membership'}:{})}:{})}:b));
    setBusy(false);
    if(ok)onClose();else setError('저장하지 못했습니다. 상단 오류를 확인해주세요.');
  }
  const candidates=members.filter(m=>search&&(m.name.includes(search)||(m.phone||'').includes(search))).slice(0,20);
  return <div style={S.overlay} onClick={close}><div style={{...S.modal,maxWidth:380}} role="dialog" aria-label="원데이 방문 정보" onClick={e=>e.stopPropagation()}>
    <div style={S.modalHead}><div><div style={S.modalTitle}>{rec.onedayName||'원데이'} 방문 정보</div><div style={{fontSize:12,color:'#9a8e80',marginTop:3}}>{fmtWithDow(rec.date)}</div></div></div>
    {!live&&<div role="alert">이 방문 기록이 없습니다. 창을 닫고 다시 확인해주세요.</div>}
    {onedayReady?<OnedayFields form={form} setForm={setForm} sales={sales} bookingId={rec.id} name={rec.onedayName} date={rec.date} lockedSaleId={live?.onedaySaleId}/>:<div>방문 구분을 불러오지 못했습니다. 새로고침해주세요.</div>}
    {error&&<div role="alert" style={{fontSize:12,color:'#c97474',marginBottom:10}}>{error}</div>}
    {onedayReady&&form.onedaySource==='general'&&form.onedayMode==='membership'&&<>
      <button disabled={busy} style={{...S.editBtn,width:'100%',marginBottom:10}} onClick={()=>setLinkMode(!linkMode)}>기존 회원과 연결</button>
      {linkMode&&<div style={{marginBottom:12}}><input aria-label="연결할 회원 검색" style={S.inp} value={search} onChange={e=>setSearch(e.target.value)} placeholder="회원 이름·전화번호 검색"/>{candidates.map(m=><button key={m.id} disabled={busy} onClick={()=>save(m.id)} style={{display:'block',width:'100%',textAlign:'left',padding:10,fontFamily:FONT,border:0,background:'#f7f5f1',marginTop:4}}>{m.name} {m.phone||''} · 연결</button>)}</div>}
    </>}
    <div style={S.modalBtns}><button disabled={busy} style={S.cancelBtn} onClick={close}>닫기</button><button disabled={busy||!onedayReady||!live||rec.id<0} style={S.saveBtn} onClick={()=>save()}>{busy?'저장 중…':'저장'}</button></div>
  </div></div>;
}
