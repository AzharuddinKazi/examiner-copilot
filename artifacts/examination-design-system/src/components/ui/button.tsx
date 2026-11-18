import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "gold" | "secondary" | "ghost";
  size?: "default" | "small";
}

/** Source .btn / .btn.gold / .btn.sm; native keyboard and disabled behavior retained. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "secondary", size = "default", className = "", type = "button", ...props }, ref) =>
    <button ref={ref} type={type} className={`exam-btn exam-btn--${variant} exam-btn--${size} ${className}`} {...props} />,
);
Button.displayName = "Button";
