const spiceMapper = {
  resistor: {
    prefix: 'R',
    model: null,
  },
  capacitor: {
    prefix: 'C',
    model: null,
  },
  diode: {
    prefix: 'D',
    model: 'DGEN',
    modelStatement: '.model DGEN D',
  },
  led: {
    prefix: 'D',
    model: 'LEDGEN',
    modelStatement: '.model LEDGEN D',
  },
  voltageSource: {
    prefix: 'V',
    model: null,
  },
} as const;

export default spiceMapper;
