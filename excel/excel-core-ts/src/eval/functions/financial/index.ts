import type { FunctionImpl } from '../../../types'
import { PV, FV, PMT, NPER, RATE } from './tvm'
import { NPV, IRR } from './cashflow-returns'
import { IPMT, PPMT, CUMIPMT } from './period-interest'
import { SLN, SYD, DB, DDB, VDB } from './depreciation'
import { AMORDEGRC, AMORLINC, CUMPRINC, EFFECT, NOMINAL, ISPMT } from './amortization'
import { DOLLARDE, DOLLARFR, ACCRINT, ACCRINTM, DISC, INTRATE, RECEIVED, TBILLEQ, TBILLPRICE, TBILLYIELD } from './discount-securities'
import { DURATION, MDURATION, PRICE, YIELD, PRICEDISC, YIELDDISC, PRICEMAT, YIELDMAT } from './bond-pricing'
import { ODDFPRICE, ODDFYIELD } from './odd-first-bonds'
import { ODDLPRICE, ODDLYIELD } from './odd-last-bonds'
import { COUPDAYBS, COUPDAYS, COUPDAYSNC, COUPNCD, COUPNUM, COUPPCD } from './coupon-schedule'
import { XIRR, XNPV, MIRR, PDURATION, RRI, FVSCHEDULE } from './cashflow-schedules'

// Public function-level compatibility exports. Export the imported bindings,
// rather than re-exporting their source modules, so each name has one export.
export {
  PV, FV, PMT, NPER, RATE,
  NPV, IRR,
  IPMT, PPMT, CUMIPMT,
  SLN, SYD, DB, DDB, VDB,
  AMORDEGRC, AMORLINC, CUMPRINC, EFFECT, NOMINAL, ISPMT,
  DOLLARDE, DOLLARFR, ACCRINT, ACCRINTM, DISC, INTRATE, RECEIVED, TBILLEQ, TBILLPRICE, TBILLYIELD,
  DURATION, MDURATION, PRICE, YIELD, PRICEDISC, YIELDDISC, PRICEMAT, YIELDMAT,
  ODDFPRICE, ODDFYIELD,
  ODDLPRICE, ODDLYIELD,
  COUPDAYBS, COUPDAYS, COUPDAYSNC, COUPNCD, COUPNUM, COUPPCD,
  XIRR, XNPV, MIRR, PDURATION, RRI, FVSCHEDULE,
}

export const FUNCTIONS: Record<string, FunctionImpl> = {
  PV,
  FV,
  PMT,
  NPER,
  RATE,
  NPV,
  IRR,
  IPMT,
  PPMT,
  CUMIPMT,
  SLN,
  SYD,
  DB,
  DDB,
  VDB,
  AMORDEGRC,
  AMORLINC,
  CUMPRINC,
  EFFECT,
  NOMINAL,
  ISPMT,
  DOLLARDE,
  DOLLARFR,
  ACCRINT,
  ACCRINTM,
  DISC,
  INTRATE,
  RECEIVED,
  TBILLEQ,
  TBILLPRICE,
  TBILLYIELD,
  DURATION,
  MDURATION,
  PRICE,
  YIELD,
  PRICEDISC,
  YIELDDISC,
  PRICEMAT,
  YIELDMAT,
  ODDFPRICE,
  ODDFYIELD,
  ODDLPRICE,
  ODDLYIELD,
  COUPDAYBS,
  COUPDAYS,
  COUPDAYSNC,
  COUPNCD,
  COUPNUM,
  COUPPCD,
  XIRR,
  XNPV,
  MIRR,
  PDURATION,
  RRI,
  FVSCHEDULE,
}
