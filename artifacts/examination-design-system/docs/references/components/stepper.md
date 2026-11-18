# Stepper
Source: supplied HTML lines 157–163 `.steps`, native button markup; handover Parts 3.3 and 4.3.
Public export: `@workspace/examination-design-system/components/ui/stepper`.
Five controlled stages, completed gold ticks, active gold fill, waiting/disabled controls, native Enter/Space and visible focus.
The app owns stage gating; the design system never advances an investigation itself. No behavior library needed.
Responsive adaptation: wrap rather than overflow in bounded documentation preview.
Validation: click each stage, disabled Report in story, current-step ARIA, both themes, narrow width.
