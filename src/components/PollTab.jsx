// ─── PollTab.jsx ─────────────────────────────────────────────────────────────
// 어드민 투표 탭 — 생성 / 수정(투표 0건만) / 결과 실명 확인 / 마감 / 삭제
import { useState, useEffect } from "react";
import { FONT } from "../constants.js";
import { dbLoadPolls, dbUpsertPoll, dbDeletePoll, dbLoadPollVotes } from "../db.js";
import S from "../styles.js";

function PollForm({ title, initQuestion, initOptions, saving, onSave, onCancel }) {
  const [question, setQuestion] = useState(initQuestion);
  const [options, setOptions] = useState(initOptions);
  const valid = question.trim() && options.filter(o => o.trim()).length >= 2;
  return (
    <div style={{ background: "#f7f5f2", borderRadius: 10, padding: 14, border: "1px solid #e0d8cc", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#3d3028", marginBottom: 8 }}>{title}</div>
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
        <button onClick={onCancel} style={S.cancelBtn}>취소</button>
        <button onClick={() => onSave(question.trim(), options.map(o => o.trim()).filter(Boolean))}
          disabled={saving || !valid}
          style={{ ...S.saveBtn, opacity: !valid ? 0.5 : 1 }}>
          {saving ? "저장 중..." : title.includes("수정") ? "저장" : "투표 활성화"}
        </button>
      </div>
    </div>
  );
}

export default function PollTab({ members }) {
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingPoll, setEditingPoll] = useState(null); // {id, question, options, status}
  const [saving, setSaving] = useState(false);
  const [closingPoll, setClosingPoll] = useState(null); // 마감 중인 poll — 코멘트 입력
  const [closeComment, setCloseComment] = useState("");
  const [result, setResult] = useState(null); // {pollId, poll, votes}
  const [resultLoading, setResultLoading] = useState(false);

  useEffect(() => {
    dbLoadPolls().then(p => { setPolls(p); setLoading(false); });
  }, []);

  async function handleCreate(question, options) {
    setSaving(true);
    const saved = await dbUpsertPoll({ question, options, status: "active" });
    if (saved) setPolls(p => [saved, ...p]);
    setSaving(false);
    setCreating(false);
  }

  async function handleEdit(question, options) {
    if (!editingPoll) return;
    setSaving(true);
    const updated = await dbUpsertPoll({ ...editingPoll, question, options });
    if (updated) setPolls(p => p.map(x => x.id === updated.id ? updated : x));
    setSaving(false);
    setEditingPoll(null);
  }

  async function handleStartEdit(poll) {
    // 투표가 1건이라도 있으면 수정 불가
    const votes = await dbLoadPollVotes(poll.id);
    if (votes.length > 0) {
      alert(`이미 ${votes.length}명이 투표했습니다. 투표 시작 전에만 수정할 수 있습니다.`);
      return;
    }
    setEditingPoll(poll);
  }

  async function handleClose() {
    if (!closingPoll) return;
    setSaving(true);
    const updated = await dbUpsertPoll({ ...closingPoll, status: "closed", closeComment: closeComment.trim() });
    if (updated) setPolls(p => p.map(x => x.id === updated.id ? updated : x));
    setSaving(false);
    setClosingPoll(null);
    setCloseComment("");
  }

  async function handleDelete(id) {
    await dbDeletePoll(id);
    setPolls(p => p.filter(x => x.id !== id));
    if (result?.pollId === id) setResult(null);
    if (editingPoll?.id === id) setEditingPoll(null);
  }

  async function handleViewResult(poll) {
    if (result?.pollId === poll.id) { setResult(null); return; }
    setResultLoading(poll.id);
    const votes = await dbLoadPollVotes(poll.id);
    setResult({ pollId: poll.id, poll, votes });
    setResultLoading(false);
  }

  const memberName = id => members.find(m => m.id === id)?.name ?? `#${id}`;

  return (
    <div style={{ padding: "14px 14px 60px" }}>
      {/* 새 투표 만들기 */}
      {!creating && !editingPoll && (
        <button onClick={() => setCreating(true)} style={{ ...S.saveBtn, width: "100%", marginBottom: 14, fontSize: 13 }}>+ 새 투표 만들기</button>
      )}
      {creating && (
        <PollForm title="새 투표" initQuestion="" initOptions={["", ""]} saving={saving}
          onSave={handleCreate} onCancel={() => setCreating(false)} />
      )}

      {/* 투표 목록 */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9a8e80", padding: 30 }}>불러오는 중...</div>
      ) : polls.length === 0 ? (
        <div style={{ textAlign: "center", color: "#9a8e80", padding: 30 }}>등록된 투표가 없습니다.</div>
      ) : polls.map(poll => (
        <div key={poll.id} style={{ marginBottom: 10, borderRadius: 10, border: `1.5px solid ${poll.status === "active" ? "#b8d8b8" : "#e0d8cc"}`, overflow: "hidden" }}>
          {/* 마감 코멘트 입력 폼 */}
          {closingPoll?.id === poll.id ? (
            <div style={{ padding: "12px 13px", background: "#fffaeb", borderBottom: "1px solid #e8c44a" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#7a5a10", marginBottom: 6 }}>📝 마감 코멘트 (선택)</div>
              <textarea
                placeholder="예) 투표 결과에 따라 야외 요가를 진행하겠습니다! 감사합니다 🙏"
                value={closeComment} onChange={e => setCloseComment(e.target.value)}
                rows={2}
                style={{ ...S.inp, width: "100%", boxSizing: "border-box", fontSize: 12, resize: "none", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setClosingPoll(null); setCloseComment(""); }} style={S.cancelBtn}>취소</button>
                <button onClick={handleClose} disabled={saving}
                  style={{ ...S.saveBtn, background: "#9a5a10", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "마감 중..." : "마감 확정"}
                </button>
              </div>
            </div>
          ) : null}

          {/* 수정 폼 */}
          {editingPoll?.id === poll.id ? (
            <div style={{ padding: "11px 13px" }}>
              <PollForm title="✏️ 투표 수정" initQuestion={poll.question} initOptions={[...poll.options]} saving={saving}
                onSave={handleEdit} onCancel={() => setEditingPoll(null)} />
            </div>
          ) : (
            <div style={{ padding: "11px 13px", background: poll.status === "active" ? "#f0f8f0" : "#fafaf7" }}>
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
                <button onClick={() => handleViewResult(poll)}
                  style={{ fontSize: 11, background: "#edf0f8", color: "#3d5494", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                  {resultLoading === poll.id ? "..." : result?.pollId === poll.id ? "결과 닫기" : "📊 결과 보기"}
                </button>
                {poll.status === "active" && (
                  <>
                    <button onClick={() => handleStartEdit(poll)}
                      style={{ fontSize: 11, background: "#f7f5f2", color: "#5a5a5a", border: "1px solid #d0c8c0", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                      ✏️ 수정
                    </button>
                    <button onClick={() => { setClosingPoll(poll); setCloseComment(""); }}
                      style={{ fontSize: 11, background: "#fdf3e3", color: "#9a5a10", border: "1px solid #e8c44a", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                      마감
                    </button>
                  </>
                )}
                <button onClick={() => handleDelete(poll.id)}
                  style={{ fontSize: 11, background: "#fff0f0", color: "#c97474", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                  삭제
                </button>
              </div>
            </div>
          )}

          {/* 결과 패널 */}
          {result?.pollId === poll.id && !editingPoll && (
            <div style={{ padding: "10px 13px", borderTop: "1px solid #e4e0d8", background: "#fff" }}>
              {resultLoading === poll.id ? (
                <div style={{ color: "#9a8e80", fontSize: 12 }}>불러오는 중...</div>
              ) : result.votes.length === 0 ? (
                <div style={{ color: "#9a8e80", fontSize: 12 }}>아직 투표한 회원이 없습니다.</div>
              ) : poll.options.map((opt, idx) => {
                const voters = result.votes.filter(v => v.optionIndex === idx);
                const pct = result.votes.length ? Math.round(voters.length / result.votes.length * 100) : 0;
                return (
                  <div key={idx} style={{ marginBottom: 9 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                      <span>{opt}</span>
                      <span style={{ color: "#9a8e80" }}>{voters.length}명 ({pct}%)</span>
                    </div>
                    <div style={{ background: "#f0ece8", borderRadius: 4, height: 6, marginBottom: 4 }}>
                      <div style={{ width: `${pct}%`, background: "#4a6a4a", borderRadius: 4, height: 6, transition: "width .3s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#9a8e80", display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {voters.map(v => (
                        <span key={v.id} style={{ background: "#f0f8f0", color: "#2e5c3e", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>{memberName(v.memberId)}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>총 {result.votes.length}명 투표</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
