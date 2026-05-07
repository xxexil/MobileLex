type FormatPhpOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatPhp(amount: number, options: FormatPhpOptions = {}) {
  const minimumFractionDigits = options.minimumFractionDigits ?? 0;
  const maximumFractionDigits = options.maximumFractionDigits ?? minimumFractionDigits;
  const numericAmount = Number.isFinite(amount) ? amount : 0;

  return `₱${numericAmount.toLocaleString('en-PH', {
    minimumFractionDigits,
    maximumFractionDigits,
  })}`;
}