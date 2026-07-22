// North-America phone formatter: (XXX)-XXX-XXXX, digits only, capped at 10.
export const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 6) return `(${numbers.slice(0, 3)})-${numbers.slice(3)}`;
  return `(${numbers.slice(0, 3)})-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
};
