/** Owner-entered carrier particulars; physical attestations remain blank on the form. */
export const freightFields = [
  ['carrier','Carrier',true],['scac','Carrier SCAC',true],['proNumber','PRO number',true],['pickupDate','Pickup date',true],
  ['shipFrom','Ship from',true],['shipTo','Ship to',true],['billTo','Bill-to',false],['freightTerms','Freight charge terms',true],
  ['palletCount','Pallet count',true],['handlingType','Handling unit type',true],['packageCount','Package count',true],['packageType','Package type',true],
  ['weight','Weight lb',true],['netWeight','Customer order weight lb',true],['palletSlip','Pallet/slip',true],['commodity','Commodity description',true],
  ['nmfc','NMFC number',true],['freightClass','NMFC freight class',true],['accessorials','Accessorials',false],['hazardous','Hazardous material',false],
  ['declaredValue','Declared value',false],['trailer','Trailer number',false],['seals','Seal numbers',false],['instructions','Special instructions',false],
  ['shipToLocation','Ship-to location',false],['sid','SID',false],['cid','CID',false],['masterBill','Master bill',false],
] as const;
