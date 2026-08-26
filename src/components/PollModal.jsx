// ─── PollModal.jsx ───────────────────────────────────────────────────────────
// 어드민 전용: 투표 생성 / 결과 확인(실명) / 마감 / 삭제
import { useState, useEffect } from "react";
import { FONT } from "../constants.js";
import { dbLoadPolls, dbUpsertPoll, dbDeletePoll, dbLoadPollVotes } from "../db.js";
import S from "../styles.js";

export default function PollModal({ members, onClose }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [saving, setSaving] = useState(false);
  // 결과 보기: {pollId, votes:[{optionIndex, memberId}]}
  const [result, setResult] = useState(null);
  const [resultLoading, setResultLoading] = useState(false);

  useEffect(() => {
    dbLoadPolls().then(p => { setPolls(p); setLoading(false); });
  }, []);

  async function handleCreate() {
    const q = question.trim();
    const opts = options.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    setSaving(true);
    const saved = await dbUpsertPoll({ question: q, options: opts, status: "active" });
    if (saved) setPolls(p => [saved, ...p]);
    setSaving(false);
    setCreating(false);
    setQuestion("");
    setOptions(["", ""]);
  }

  async function handleClose(poll) {
    const updated = await dbUpsertPoll({ ...poll, status: "closed" });
    if (updated) setPolls(p => p.map(x => x.id === updated.id ? updated : x));
    if (result?.pollId === poll.id) setResult(r => ({ ...r, closed: true }));
  }

  async function handleDelete(id) {
    await dbDeletePoll(id);
    setPolls(p => p.filter(x => x.id !== id));
    if (result?.pollId === id) setResult(null);
  }

  async function handleViewResult(poll) {
    setResultLoading(true);
    const votes = await dbLoadPollVotes(poll.id);
    setResult({ pollId: poll.id, poll, votes });
    setResultLoading(false);
  }

  const memberName = (id) => members.find(m => m.id === id)?.name ?? `#${id}`;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span>🗳️</span>
          <div><div style={S.modalTitle}>투표 관리</div></div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "0 2px" }}>
          {/* 새 투표 만들기 */}
          {!creating ? (
            <button onClick={() => setCreating(true)} style={{ ...S.saveBtn, width: "100%", marginBottom: 14, fontSize: 13 }}>+ 새 투표 만들기</button>
          ) : (
            <div style={{ background: "#f7f5f2", borderRadius: 10, padding: "14px", border: "1px solid #e0d8cc", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#3d3028", marginBottom: 8 }}>새 투표</div>
              <input
                placeholder="질문 입력 (예: 야외 요가 참여하시겠어요?)"
                value={question} onChange={e => setQuestion(e.target.value)}
                style={{ ...S.inp, width: "100%", boxSizing: "border-box", marginBottom: 8, fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: "#9a8e80", marginBottom: 6 }}>보기 (최소 2개)</div>
              {options.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
                  <input
                    placeholder={`보기 ${i + 1}`}
                    value={opt} onChange={e => setOptions(o => o.map((v, j) => j === i ? e.target.value : v))}
                    style={{ ...S.inp, flex: 1, fontSize: 13 }}
                  />
                  {options.length > 2 && (
                    <button onClick={() => setOptions(o => o.filter((_, j) => j !== i))}
                      style={{ background: "#f0e8e0", border: "none", borderRadius: 7, padding: "4px 8px", cursor: "pointer", color: "#9a6050", fontSize: 13 }}>✕</button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button onClick={() => setOptions(o => [...o, ""])}
                  style={{ fontSize: 12, color: "#3d5494", background: "none", border: "1px dashed #b0c4e8", borderRadius: 7, padding: "4px 12px", cursor: "pointer", fontFamily: FONT, marginBottom: 8 }}>
                  + 보기 추가
                </button>
              )}
              <div style={{ display: "flex", gap: 7, marginTop: 6 }}>
                <button onClick={() => { setCreating(false); setQuestion(""); setOptions(["", ""]); }} style={S.cancelBtn}>취소</button>
                <button onClick={handleCreate} disabled={saving || !question.trim() || options.filter(o => o.trim()).length < 2}
                  style={{ ...S.saveBtn, opacity: (!question.trim() || options.filter(o => o.trim()).length < 2) ? 0.5 : 1 }}>
                  {saving ? "저장 중..." : "투표 활성화"}
                </button>
              </div>
            </div>
          )}

          {/* 투표 목록 */}
          {loading ? <div style={{ textAlign: "center", color: "#9a8e80", padding: 20 }}>불러오는 중...</div> : (
            polls.length === 0 ? <div style={{ textAlign: "center", color: "#9a8e80", padding: 20 }}>등록된 투표가 없습니다.</div> : (
              polls.map(poll => (
                <div key={poll.id} style={{ marginBottom: 10, borderRadius: 10, border: `1.5px solid ${poll.status === "active" ? "#b8d8b8" : "#e0d8cc"}`, overflow: "hidden" }}>
                  <div style={{ padding: "10px 13px", background: poll.status === "active" ? "#f0f8f0" : "#fafaf7" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: poll.status === "active" ? "#2a6e44" : "#bbb", color: "#fff" }}>
                        {poll.status === "active" ? "진행중" : "마감"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{poll.question}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#9a8e80", marginBottom: 8 }}>
                      {poll.options.map((o, i) => <span key={i} style={{ marginRight: 8 }}>· {o}</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => result?.pollId === poll.id ? setResult(null) : handleViewResult(poll)}
                        style={{ fontSize: 11, background: "#edf0f8", color: "#3d5494", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                        {resultLoading && result?.pollId !== poll.id ? "..." : result?.pollId === poll.id ? "결과 닫기" : "📊 결과 보기"}
                      </button>
                      {poll.status === "active" && (
                        <button onClick={() => handleClose(poll)}
                          style={{ fontSize: 11, background: "#fdf3e3", color: "#9a5a10", border: "1px solid #e8c44a", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                          마감
                        </button>
                      )}
                      <button onClick={() => handleDelete(poll.id)}
                        style={{ fontSize: 11, background: "#fff0f0", color: "#c97474", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* 결과 패널 */}
                  {result?.pollId === poll.id && (
                    <div style={{ padding: "10px 13px", borderTop: "1px solid #e4e0d8", background: "#fff" }}>
                      {resultLoading ? <div style={{ color: "#9a8e80", fontSize: 12 }}>불러오는 중...</div> : (
                        result.votes.length === 0 ? <div style={{ color: "#9a8e80", fontSize: 12 }}>아직 투표한 회원이 없습니다.</div> : (
                          poll.options.map((opt, idx) => {
                            const voters = result.votes.filter(v => v.optionIndex === idx);
                            const pct = result.votes.length ? Math.round(voters.length / result.votes.length * 100) : 0;
                            return (
                              <div key={idx} style={{ marginBottom: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                                  <span>{opt}</span>
                                  <span style={{ color: "#9a8e80" }}>{voters.length}명 ({pct}%)</span>
                                </div>
                                <div style={{ background: "#f0ece8", borderRadius: 4, height: 6, marginBottom: 4 }}>
                                  <div style={{ width: `${pct}%`, background: "#4a6a4a", borderRadius: 4, height: 6, transition: "width .3s" }} />
                                </div>
                                <div style={{ fontSize: 11, color: "#9a8e80", display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {voters.map(v => <span key={v.id} style={{ background: "#f0f8f0", color: "#2e5c3e", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{memberName(v.memberId)}</span>)}
                                </div>
                              </div>
                            );
                          })
                        )
                      )}
                      <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>총 {result.votes.length}명 투표</div>
                    </div>
                  )}
                </div>
              ))
            )
          )}
        </div>

        <div style={S.modalBtns}>
          <button style={{ ...S.cancelBtn, flex: 1 }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
