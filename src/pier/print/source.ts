import type { Row } from '../model';
import type { BusinessPDFInput } from './pdf-types';
export type DocumentSource={source:Row;sourceKind:string;reference:string;recipient:string;lines:BusinessPDFInput['lines'];fields:{label:string;value:string}[];totals:{label:string;value:string}[];payNowUrl?:string};
