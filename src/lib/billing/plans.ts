export const PLANS={
 Free:{plan:'Free',amount:0,currency:'KRW',interval:'month',requiresPayment:false},
 Startup:{plan:'Startup',amount:49000,currency:'KRW',interval:'month',requiresPayment:true},
 Enterprise:{plan:'Enterprise',amount:null,currency:'KRW',interval:'custom',requiresPayment:false},
 Business:{plan:'Business',amount:149000,currency:'KRW',interval:'month',requiresPayment:true}
} as const;
