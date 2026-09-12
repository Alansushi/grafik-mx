// Contrato de fallos del configurador: toda excepción propia de estudio/lib/**
// y de los módulos PURA de api/_lib/** es una subclase de AppError con un
// `.code` estable. Los tests assertan el code, nunca el message — el message
// es sólo para humanos y puede cambiar sin romper nada.

export class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

export class PricingError extends AppError {}
export class ValidationError extends AppError {}
export class GeometryError extends AppError {}
export class MpConfigError extends AppError {}
export class OrderStateError extends AppError {}
export class TaintedCanvasError extends AppError {}
