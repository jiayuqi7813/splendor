import { CheckCircle2, RotateCcw, ShoppingCart, Sparkles } from "lucide-react";
import type { BasicColor, Gems } from "../types";
import { BASIC_COLORS, COLOR_LABELS, TOKEN_IMAGES, cardImageUrl } from "../types";
import { DropZone, useBoardDrag } from "./BoardDragProvider";

function paymentCount(gems: Partial<Gems>, color: keyof Gems) {
  return gems[color] ?? 0;
}

function sumManualPayment(gems: Partial<Gems>) {
  return (["white", "blue", "green", "red", "brown", "gold"] as const).reduce((sum, color) => sum + paymentCount(gems, color), 0);
}

export function PaymentDropZone() {
  const { selectedCard, selectedCardSource, stagedPayment, paymentPlan, clearPayment, confirmBuy } = useBoardDrag();
  const manualCount = sumManualPayment(stagedPayment);

  return (
    <DropZone id="selected-card-zone" className="purchase-zone" onDoubleClick={confirmBuy} label="购买区，双击确认购买">
      <div className="mini-section-head">
        <strong>购买区</strong>
        <span className="purchase-head-actions">
          {selectedCard ? <em>{selectedCardSource === "reserved" ? "来自预留区" : "来自市场"}</em> : null}
          <button type="button" onClick={clearPayment} aria-label="清空手动支付">
            <RotateCcw size={15} />
          </button>
        </span>
      </div>

      {selectedCard && paymentPlan ? (
        <div className="purchase-content">
          <DropZone id={`card-drop:${selectedCard.id}`} className="purchase-card-image" onDoubleClick={confirmBuy}>
            <img src={cardImageUrl(selectedCard.id)} alt="" />
            <b>{selectedCard.prestige}</b>
          </DropZone>

          <div className="purchase-card-meta">
            <strong>
              {COLOR_LABELS[selectedCard.color]} · 等级 {selectedCard.tier}
            </strong>
            <span>
              费用：
              {BASIC_COLORS.filter((color) => selectedCard.cost[color] > 0).map((color) => (
                <em key={color}>
                  <img src={TOKEN_IMAGES[color]} alt="" />
                  {selectedCard.cost[color]}
                </em>
              ))}
            </span>
            <p>{paymentPlan.canBuy ? "条件已满足，可以直接购买。" : `还缺 ${paymentPlan.missingTotal} 枚宝石。`}</p>
          </div>

          <div className="payment-summary">
            <div className="payment-need-row">
              {BASIC_COLORS.map((color: BasicColor) => (
                <span key={color} className={paymentPlan.remaining[color] ? "missing" : "covered"}>
                  <img src={TOKEN_IMAGES[color]} alt="" />
                  <b>{COLOR_LABELS[color]}</b>
                  <em>
                    {paymentPlan.coloredPayment[color] + paymentPlan.goldSubstitutions[color]}/{paymentPlan.need[color]}
                  </em>
                </span>
              ))}
            </div>

            <div className="payment-token-row compact">
              {(["white", "blue", "green", "red", "brown", "gold"] as const).map((color) => (
                <span key={color} className={paymentCount(stagedPayment, color) ? "active" : ""}>
                  <img src={TOKEN_IMAGES[color]} alt="" />
                  {color === "gold" ? paymentPlan.goldTotal : paymentPlan.coloredPayment[color]}
                </span>
              ))}
            </div>

            <span className="manual-payment-note">{manualCount ? `手动放入 ${manualCount} 枚，系统仍会自动校验支付。` : "无需拖入宝石，系统会自动选择支付组合。"}</span>

            <button type="button" className={`purchase-button ${paymentPlan.canBuy ? "ready" : ""}`} disabled={!paymentPlan.canBuy} onClick={confirmBuy}>
              {paymentPlan.canBuy ? <ShoppingCart size={17} /> : <CheckCircle2 size={17} />}
              {paymentPlan.canBuy ? "购买这张卡" : `还缺 ${paymentPlan.missingTotal} 枚`}
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-drop-copy">
          <Sparkles size={24} />
          <strong>拖发展卡到这里</strong>
          <span>也可以点击市场卡进行选择</span>
        </div>
      )}
    </DropZone>
  );
}
