/**
 * 待审原因 `pending_reason`（guji-format char v0.4 §4.8）的显示名。
 *
 * 真源在 open-guji-cv `open_guji_cv/review/pending_reasons.yaml`（`python -m open_guji_cv.review.pending_reason --json` 导出），
 * 这里只抄显示名，阅读器悬停用；认不出的值显示「原因不明」。规范见 cv `doc/design/待审原因PendingReason.md`。
 */
export const PENDING_REASON_LABELS: Readonly<Record<string, string>> = {
    seg_page_unaligned: '整页对不上',
    seg_col_unaligned: '整列对不上',
    col_width_out_of_band: '列宽异常',
    seg_defect: '切坏格',
    occluded_with_ref: '有遮挡',
    occluded_no_ref: '有遮挡且参校本缺',
    hard_pair: '极难形近',
    group_abstain: '形近字·没把握',
    group_conflict: '形近字·判法打架',
    group_demoted: '形近字·复核推翻',
    group_ref_dissent: '形近字·与参校本不同',
    group_weak: '形近字·证据弱',
    group_form_open: '写法待定',
    near_form_guard: '形近字',
    variant_pair: '异体字',
    lib_missing: '少见的字',
    lib_sparse_dissent: '刻例太少·不一致',
    lib_sparse_agree: '刻例太少',
    lib_unrecognized: '库认不出',
    garble_gate: '像框线或墨点',
    ref_lacuna: '参校本缺字',
    ref_gap: '参校本这里没字',
    ref_replaced: '参校本改过字',
    ref_mismatch: '和参校本不一致',
    ruling_conflict: '裁定有冲突',
    vision_flagged: '看图觉得不对',
    machine_changed: '机器改了字',
    recheck: '复审',
    unknown: '原因不明',
};

/** 合法的待审原因值（spec/02 §4.8：`^[a-z][a-z0-9_]*$`） */
export const PENDING_REASON_RE = /^[a-z][a-z0-9_]*$/;

export function pendingReasonLabel(value: string): string {
    return PENDING_REASON_LABELS[value] ?? PENDING_REASON_LABELS.unknown ?? value;
}
