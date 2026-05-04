import { CheckCircle2, RotateCcw } from "lucide-react";
import type { BasicColor, Gems } from "../types";
import { BASIC_COLORS, COLOR_LABELS, TOKEN_IMAGES } from "../types";
import { DropZone, useBoardDrag } from "./BoardDragProvider";

function paymentCount(gems: Partial<Gems>, color: keyof Gems) {
  return gems[color] ?? 0;
}

export function PaymentDropZone() {
  const { selectedCard, stagedPayment, paymentPlan, clearPayment, confirmBuy } = useBoardDrag();

  return (
    <DropZone id="payment-zone" className="payment-drop-zone" onDoubleClick={confirmBuy} label="支付区，双击确认购买">
      <div className="mini-section-head">
        <strong>支付区域</strong>
        <button type="button" onClick={clearPayment} aria-label="清空支付区">
          <RotateCcw size={15} />
        </button>
      </div>

      {selectedCard && paymentPlan ? (
        <>
          <div className="payment-token-row">
            {(["white", "blue", "green", "red", "brown", "gold"] as const).map((color) => (
              <span key={color} className={paymentCount(stagedPayment, color) ? "active" : ""}>
                <img src={TOKEN_IMAGES[color]} alt="" />
                {paymentCount(stagedPayment, color)}
              </span>
            ))}
          </div>

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

          <div className={`purchase-meter ${paymentPlan.canBuy ? "ready" : ""}`}>
            <CheckCircle2 size={17} />
            {paymentPlan.canBuy ? "双击购买" : `还缺 ${paymentPlan.missingTotal} 枚`}
          </div>
        </>
      ) : (
        <div className="empty-drop-copy">
          <strong>拖放宝石到此处</strong>
          <span>先选择一张要购买的发展卡</span>
        </div>
      )}
    </DropZone>
  );
}
