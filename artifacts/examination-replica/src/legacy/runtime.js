// @ts-nocheck

    export function initLegacyRuntime(container) {
    const S_STORE = {};

    
"use strict";
/* =================== helpers =================== */
const $=s=>container.querySelector(s),$$=s=>[...container.querySelectorAll(s)];
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
const aed=n=>"AED "+Math.round(n).toLocaleString("en");
const fmtD=d=>new Date(d+"T00:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"});
const iso=d=>d.toISOString().slice(0,10);
const now=()=>new Date().toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hashN=s=>{let h=7;for(const c of s)h=(h*31+c.charCodeAt(0))%9973;return h};
const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2200)};
const RB_STD="https://rulebook.centralbank.ae/en/rulebook/consumer-protection-standards";
const RB_ART2="https://rulebook.centralbank.ae/en/rulebook/article-2-disclosure-and-transparency";
const LBL={Pass:"OK",Fail:"Problem",Warning:"Check",Insufficient:"Missing info",NA:"Not checked"};
const ICON={Pass:"✓",Fail:"✕",Warning:"!",Insufficient:"?",NA:"–"};
const badge=s=>`<span class="b ${s}">${LBL[s]}</span>`;

/* =================== entities =================== */
const ENT={"A-MRC":{lfi:"Demo Bank A",mask:"D••• B••• A",prod:"Meridian Rewards Card",type:"Conventional bank",lic:"DEMO-LIC-0042",case:"EXM-2026-A-0147",seeded:true,last:"Mar 2024",cards:"30,000"},
 "B-HCC":{lfi:"Demo Bank B",mask:"D••• B••• B",prod:"Harbour Cashback Card",type:"Conventional bank",lic:"DEMO-LIC-0077",case:"EXM-2026-B-0031",last:"Nov 2023",cards:"18,500"},
 "C-OTC":{lfi:"Demo Bank C",mask:"D••• B••• C",prod:"Oasis Travel Card",type:"Islamic bank",lic:"DEMO-LIC-0103",case:"EXM-2026-C-0012",last:"Jun 2024",cards:"9,200"}};

/* =================== documents (synthetic pages) =================== */
const DOCS={
 KFS:{n:"KFS",full:"Key Facts Statement",file:"DemoBankA_Meridian_KFS_EN_v2026-09.pdf",pg:"p. 1–2",q:"Text layer · 99%",w:.30,blocks:[
  {h:"Meridian Rewards Card — Key Facts Statement"},{m:"Demo Bank A · Effective 1 Sep 2026 · v2026-09 · English"},
  {s:"Costs"},{id:"KFS-APR",k:"Interest rate (purchases)",v:"3.25% per month · 39.00% p.a.",p:"2"},{id:"KFS-FEE",k:"Annual fee",v:"AED 299 excl. VAT · waived in year 1",p:"2"},
  {id:"KFS-LATE",k:"Late payment fee",v:"AED 230 excl. VAT per missed due date",small:1,p:"2"},{id:"KFS-CASH",k:"Cash withdrawal",v:"3% · minimum AED 99",p:"2"},
  {id:"KFS-FX",k:"Foreign currency",v:"2.99% of amount",p:"2"},{id:"KFS-MIN",k:"Minimum payment",v:"5% of balance or AED 100",p:"2"},
  {s:"Rewards"},{id:"KFS-RWD",k:"Dining & travel",v:"3 points per AED 1",p:"2"},
  {s:"Key risks"},{id:"KFS-RISK",t:"Paying only the minimum amount will increase the interest you pay and the time it takes to repay your balance.",p:"2"},
  {s:"Help & complaints"},{id:"KFS-CMP",k:"Complaints",v:"24/7 contact centre · app · branches",p:"2"},{id:"KFS-SAN",k:"Escalation",v:"Sanadak, if unresolved",p:"2"}]},
 TNC:{n:"T&Cs",full:"Terms & Conditions",file:"DemoBankA_Meridian_TnC_EN_v2026-09.pdf",pg:"p. 3–19",q:"Text layer · 97%",w:.20,blocks:[
  {h:"Credit Card Terms & Conditions"},{m:"Demo Bank A · Effective 1 Sep 2026 · 24 pages · excerpts"},
  {id:"TNC-4.2",c:"4.2",t:"You may cancel this agreement within 5 business days of signing without penalty, provided the card has not been used.",p:"3"},
  {id:"TNC-12.1",c:"12.1",t:"The minimum payment is 5% of the outstanding balance or AED 100, whichever is higher.",p:"9"},
  {id:"TNC-14.3",c:"14.3",t:"We will give you at least 60 days' notice of any increase to the fees in the Schedule.",p:"11"},
  {id:"TNC-16.1",c:"16.1",t:"Interest is charged at 3.25% per month on balances not paid in full by the due date.",p:"12"},
  {id:"TNC-16.3",c:"16.3",t:"The Bank may revise the interest rate from time to time.",p:"12"},
  {id:"TNC-18.2",c:"18.2",t:"You are liable for all transactions made on your card before you notify us that it is lost or stolen.",p:"14"},
  {id:"TNC-19.1",c:"19.1",t:"Report a lost or stolen card 24/7 through the app or contact centre.",p:"14"},
  {id:"TNC-21.1",c:"21.1",t:"The Bank may set off any amount due against any account you hold with us without prior notice.",p:"16"},
  {id:"TNC-25.4",c:"25.4",t:"By using the card you consent to the Bank sharing your information with its partners and service providers.",p:"19"}]},
 FEES:{n:"Fees",full:"Schedule of Fees",file:"DemoBankA_Meridian_FEES_EN_v2026-09.pdf",pg:"p. 4 · p. 9 OCR",q:"Text + OCR p.9 · 93%",w:.20,table:[
  ["FEES-AF","Annual fee","AED 399","Excl. VAT · anniversary · waived Y1","4"],["FEES-LATE","Late payment","AED 230","Per missed due date","4"],["FEES-CASH","Cash withdrawal","3% · min AED 99","Per transaction","4"],
  ["FEES-FX","Foreign currency","2.99%","Of amount","4"],["FEES-REP","Card replacement","AED 50","Excl. VAT","4"],["FEES-OL","Over-limit","AED 249","With consent · OCR p.9","9"]]},
 RWD:{n:"Rewards",full:"Rewards Terms",file:"DemoBankA_Meridian_RWD_EN_v2026-09.pdf",pg:"p. 3–5",q:"Text layer · 98%",w:.10,blocks:[
  {h:"Meridian Rewards Programme Terms"},{m:"Demo Bank A · Effective 1 Sep 2026"},
  {id:"RWD-EARN",c:"3.1",t:"Cardholders earn 3 Meridian Points per AED 1 on eligible dining and travel spend.",p:"3"},
  {id:"RWD-CAP",c:"3.2",t:"Accelerated earning is capped at 15,000 points per statement cycle.",p:"3"},
  {id:"RWD-EXCL",c:"3.4",t:"Transactions via third-party wallets, aggregators and food-delivery apps are not treated as dining.",p:"3"},
  {id:"RWD-EXP",c:"3.6",t:"Points expire 24 months after the month in which they were earned.",p:"3"},
  {id:"RWD-7.1",c:"7.1",t:"The Bank may amend, suspend or withdraw the programme at any time without notice.",p:"5"}]},
 AR:{n:"AR",full:"Arabic KFS",file:"DemoBankA_Meridian_KFS_AR_v2026-09.pdf",pg:"p. 2",q:"Text layer · 98%",extra:1,blocks:[{h:"بطاقة ميريديان للمكافآت — بيان الحقائق الرئيسية"},{id:"AR-FEE",k:"الرسوم السنوية",v:"299 درهم (غير شاملة الضريبة)",p:"2",rtl:1},{id:"AR-APR",k:"سعر الفائدة",v:"3.25% شهرياً",p:"2",rtl:1}]},
 PREV:{n:"Fees v2025",full:"Fees Schedule (Nov 2025)",file:"DemoBankA_Meridian_FEES_EN_v2025-11.pdf",pg:"p. 4",q:"Historical · Fusion DB",extra:1,table:[["PREV-AF","Annual fee","AED 299","Excl. VAT · anniversary","4"],["PREV-LATE","Late payment","AED 230","Per due date","4"]]},
 STM:{n:"Statement",full:"Statement sample (Oct 2026)",file:"DemoBankA_Meridian_STM_2026-10_redacted.pdf",pg:"p. 1",q:"Text layer · 99%",extra:1,blocks:[{h:"Monthly statement — October 2026 (redacted)"},{id:"STM-MIN",k:"Minimum payment due",v:"AED 150",p:"1"},{id:"STM-EST",t:"Repayment estimate: 38 months; total interest AED 2,100, assuming minimum payments and no new transactions.",p:"1"}]},
 MKT:{n:"Brochure",full:"Marketing brochure (Sep 2026)",file:"DemoBankA_Meridian_brochure_2026-09.pdf",pg:"p. 1",q:"Text layer",extra:1,blocks:[{h:"Earn 3X on dining & travel"},{id:"MKT-1",t:"Earn 3X points on every dining and travel spend — no limits on how you enjoy life.",p:"1"}]}
};
const CORE=["KFS","TNC","FEES","RWD"];
const lineOf=id=>{for(const d in DOCS){const D=DOCS[d];const b=(D.blocks||[]).find(x=>x.id===id);if(b)return{d,p:b.p,t:b.t||`${b.k}: ${b.v}`};const r=(D.table||[]).find(x=>x[0]===id);if(r)return{d,p:r[4],t:`${r[1]} · ${r[2]} · ${r[3]}`}}return null};

/* =================== rule pack (100, paraphrased) =================== */
const THEMES={DIS:"Disclosure",FEE:"Fees",RWD:"Rewards",CRD:"Credit terms",FAIR:"Fair treatment",LANG:"Language",DATA:"Data",CMP:"Complaints",FRD:"Fraud",GOV:"Governance"};
const RULES=`DIS-01|Stand-alone KFS|A stand-alone Key Facts Statement must be provided for the product.|KFS|H|KFS-APR
DIS-02|Plain language|The KFS must use plain, clear language and a readable layout.|KFS|M|
DIS-03|All fees in KFS|The KFS must state all material fees and charges.|KFS FEES|H|KFS-FEE
DIS-04|Consistent fees across docs|The same fee or rate must be stated consistently across all customer documents for the same product and date.|KFS FEES TNC|H|
DIS-05|Monthly and annual rate|Interest rates must be disclosed as both a monthly and an annual rate.|KFS|H|KFS-APR
DIS-06|Prominence of costs|Key costs, risks and warnings must be given due prominence, not smaller than other content.|KFS|M|
DIS-07|No fine print|Material terms must be highlighted rather than placed in fine print.|KFS TNC|M|
DIS-08|Effective date shown|Each document must show its effective date and version.|KFS TNC FEES RWD|L|KFS-APR
DIS-09|Cooling-off right|The cooling-off right and its conditions must be disclosed.|KFS TNC|M|
DIS-10|Change-notice period|The notice period for changes to terms must be disclosed.|TNC|M|TNC-14.3
DIS-11|Complaint channels|Contact points and complaint channels must be disclosed.|KFS TNC|M|KFS-CMP
DIS-12|Sanadak escalation|Information on escalation to Sanadak must be disclosed.|KFS TNC|M|KFS-SAN
DIS-13|Cost example|A representative cost example must be provided.|KFS|M|KFS-MIN
DIS-14|Features & eligibility|Product features and eligibility criteria must be stated.|KFS|L|KFS-RWD
DIS-15|Pre-contract acknowledgement|Pre-contract disclosure must be evidenced by customer acknowledgement.|OTH|M|
FEE-01|Complete fee schedule|The fee schedule must list every fee with its amount and charging basis.|FEES|H|FEES-AF
FEE-02|VAT treatment|VAT treatment must be stated for each fee.|FEES KFS|M|FEES-AF
FEE-03|Annual fee & waiver|The annual fee and any waiver conditions must be stated clearly.|KFS FEES|H|KFS-FEE
FEE-04|Fees disclosed before charging|Every fee charged must be disclosed to the customer before it applies.|FEES KFS|H|
FEE-05|Within fee limits|Fees must be within the approved maximum fee limits.|FEES|H|
FEE-06|Notice of fee increase|Customers must receive advance notice before any fee increase.|TNC|H|TNC-14.3
FEE-07|Late fee once per cycle|The late payment fee may be charged no more than once per missed due date.|FEES TNC|M|FEES-LATE
FEE-08|Cash withdrawal fee|Cash withdrawal fees and their interest basis must be disclosed.|KFS FEES|M|KFS-CASH
FEE-09|FX fee disclosed|Foreign currency transaction fees must be disclosed.|KFS FEES|M|KFS-FX
FEE-10|Over-limit with consent|Over-limit fees may apply only with the customer's prior consent.|TNC FEES|M|FEES-OL
FEE-11|No closure fee|No fee may be charged for closing the card account.|TNC FEES|M|
FEE-12|Replacement fee disclosed|Card replacement and statement copy fees must be disclosed.|FEES|L|FEES-REP
RWD-01|Headline benefit matches|The headline benefit in the KFS must match the rewards terms.|KFS RWD|M|RWD-EARN
RWD-02|Caps with benefit|Caps, exclusions and minimum spend must be disclosed alongside the headline benefit.|KFS RWD|M|
RWD-03|Expiry prominent|Expiry of points or cashback must be disclosed prominently.|KFS RWD|L|
RWD-04|Notice of programme change|Changes to the rewards programme require advance notice to cardholders.|RWD|M|
RWD-05|Promo duration|Promotional rates must state their duration and the rate that follows.|KFS|M|
RWD-06|Fair marketing|Marketing material must be fair, clear and not misleading.|OTH|M|
RWD-07|Redemption process|The redemption process and timelines must be described.|RWD|L|RWD-EARN
RWD-08|Eligible categories|Eligible and excluded merchant categories must be listed.|RWD|L|RWD-EXCL
RWD-09|Welcome offer terms|Welcome offers must state their qualifying conditions.|RWD KFS|L|
RWD-10|Rewards on closure|Treatment of unredeemed rewards on card closure must be disclosed.|RWD|L|
CRD-01|Minimum payment explained|The minimum payment and how it is calculated must be explained.|KFS TNC|H|TNC-12.1
CRD-02|Repayment illustration|The minimum-payment warning must include a repayment illustration.|KFS|M|
CRD-03|Interest-free period|The interest-free period and its conditions must be explained.|KFS TNC|M|
CRD-04|Interest method|The interest calculation method must be disclosed.|TNC|M|TNC-16.1
CRD-05|Credit limit setting|How the credit limit is set and changed must be explained.|TNC|M|
CRD-06|Limit increase consent|Credit limit increases require the customer's consent.|TNC|H|
CRD-07|Statement content|Statements must show balance, minimum due, due date and fees charged.|STM|M|
CRD-08|Payment allocation|The order in which payments are allocated must be disclosed.|TNC|M|
CRD-09|Supplementary cards|Liability for supplementary cards must be explained.|TNC|M|
CRD-10|Notice of rate change|Interest rate changes require prior notice to the customer.|TNC|H|
CRD-11|Affordability check|An affordability assessment must be completed before issuance.|OTH|H|
CRD-12|Closure process|The card closure and balance settlement process must be described.|TNC|L|
FAIR-01|No risk shifting|Contract terms must not shift all risk to the consumer.|TNC|H|
FAIR-02|Set-off with notice|Set-off rights may be exercised only after prior notice.|TNC|M|
FAIR-03|No unilateral change|Terms must not be changed unilaterally without notice.|TNC|H|TNC-14.3
FAIR-04|Exit without penalty|Customers may exit without penalty after a change notice.|TNC|M|
FAIR-05|No bundling|Other products must not be bundled as a condition of the card.|TNC KFS|M|
FAIR-06|Fair collections|Collection practices must be fair and respectful.|TNC CMP|M|
FAIR-07|Hardship support|Support for customers in payment difficulty must be described.|TNC|M|
FAIR-08|Vulnerable customers|Vulnerable consumers must be treated with due care.|CMP|M|
FAIR-09|No charge for bank error|Customers must not be charged for errors made by the bank.|TNC|M|
FAIR-10|No negligence exclusion|Terms must not exclude the bank's liability for its own negligence.|TNC|H|
LANG-01|Arabic & English|Customer documents must be available in Arabic and English.|KFS TNC FEES RWD|M|
LANG-02|AR/EN consistency|Arabic and English versions must be consistent.|AR|M|
LANG-03|Readable font|Text must meet a minimum readable font size.|KFS|L|KFS-APR
LANG-04|Accessible formats|Accessible formats must be available for People of Determination.|OTH|M|
LANG-05|Accessible channels|Branch and digital channels must be accessible to People of Determination.|OTH|M|
LANG-06|Language choice|Customers can choose their preferred communication language.|TNC|L|
LANG-07|Contract copy|A copy of the signed contract must be provided to the customer.|OTH|L|
LANG-08|Terms explained|Technical terms must be explained in plain language.|KFS TNC|L|
DATA-01|Data consent|Consent must be obtained for collecting and using customer data.|TNC|H|
DATA-02|Specific sharing consent|Sharing data with third parties requires specific consent.|TNC|H|
DATA-03|Purpose disclosed|The purposes of data use must be disclosed.|TNC|M|
DATA-04|Access & correction|Customers can access and correct their data.|TNC|M|
DATA-05|Retention period|The data retention period must be disclosed.|TNC|L|
DATA-06|Marketing opt-out|Customers can opt out of marketing.|TNC|M|
DATA-07|Confidentiality|Customer information must be kept confidential.|TNC|H|
DATA-08|Breach notification|A data breach notification process must exist.|OTH|M|
CMP-01|Acknowledgement time|Complaints must be acknowledged within the set timeframe (demo parameter: 2 days).|CMP|M|
CMP-02|Resolution time|Complaints must be resolved within the set timeframe (demo parameter: 30 days).|CMP|M|
CMP-03|Root cause analysis|Root cause analysis must be performed on closed complaints.|CMP|M|
CMP-04|Written outcome & Sanadak|Resolution and Sanadak referral details must be shared in writing.|CMP|M|
CMP-05|Process disclosed|The complaints process must be disclosed in customer documents.|KFS TNC|M|KFS-CMP
CMP-06|Free channels|Complaint channels must be free of charge.|TNC|M|
CMP-07|Complete records|Complaint records must be complete and accurate.|CMP|L|
CMP-08|Redress when upheld|Financial redress must be provided where a complaint is upheld.|CMP|M|
CMP-09|Sanadak tracking|Escalations to Sanadak must be tracked.|CMP|L|
CMP-10|PoD prioritised|Complaints from People of Determination must be prioritised.|CMP|M|
CMP-11|Themes to management|Recurring complaint themes must be reported to management.|OTH|M|
CMP-12|Court cases flagged|Complaints pending in court must be identified separately.|CMP|L|
FRD-01|Fair fraud liability|Customer liability for unauthorised transactions must be limited and fair.|TNC|H|
FRD-02|24/7 loss reporting|Lost or stolen cards must be reportable 24/7.|KFS TNC|H|TNC-19.1
FRD-03|Fraud claim timeliness|Fraud claims must be investigated within a defined timeframe (demo parameter: 30 days).|CMP|M|
FRD-04|Refund process|The refund process for disputed transactions must be described.|TNC|M|
FRD-05|Transaction alerts|Transaction alerts must be provided to cardholders.|TNC|M|
FRD-06|Clear security duties|Card security obligations must be clear and reasonable.|TNC|M|TNC-19.1
FRD-07|Chargeback rights|Chargeback rights must be explained.|TNC|L|
FRD-08|No liability after report|Customers must not be liable for transactions after reporting a loss.|TNC|H|TNC-19.1
GOV-01|Product approval|The product must have passed the bank's product approval process.|OTH|M|
GOV-02|Version control|Customer documents must be version-controlled.|KFS TNC FEES RWD|L|KFS-APR
GOV-03|Staff training|Staff must be trained on disclosure requirements.|OTH|L|
GOV-04|Record retention|Records must be retained for the required period.|OTH|L|
GOV-05|Board-approved policy|A board-approved consumer protection policy must exist.|OTH|M|`.split("\n").map(l=>{const[id,n,t,d,s,a]=l.split("|");return{id,n,t,docs:d.split(" "),sev:s,anchor:a||"",theme:THEMES[id.split("-")[0]]}});
const R=id=>RULES.find(r=>r.id===id);
const SEV={H:"High",M:"Medium",L:"Low"};
const TRIG=/\b(consistently|all material fees|every fee|all|prior notice|advance notice|due prominence|prominently|not smaller|specific consent|limited and fair|alongside|repayment illustration|Arabic and English|cooling-off|within the set timeframe|in writing|prioritised|must not|free of charge|24\/7|both a monthly and an annual)\b/gi;

/* =================== complaints (synthetic Fusion DB) =================== */
const CATS=["Fees & charges","Rewards & cashback","Fraud & unauthorised","Billing & statements","Collections","Customer service","Card services"];
const CAUSES={"Fees & charges":l=>l?{"Annual fee charged differs from KFS":.7,"Fee waiver not applied":.2,"Customer misunderstanding":.1}:{"Fee waiver not applied":.5,"Customer misunderstanding":.4,"Staff error":.1},
 "Rewards & cashback":()=>({"Rewards cap/exclusion not clear":.6,"System error":.25,"Customer misunderstanding":.15}),
 "Fraud & unauthorised":l=>({"Fraud claim declined under cl. 18.2":l?.55:.3,"Fraud investigation delay":.35,"Merchant dispute":l?.1:.35}),
 "Billing & statements":()=>({"Statement error":.4,"Customer misunderstanding":.4,"System error":.2}),"Collections":()=>({"Collection call conduct":.5,"Policy applied correctly":.5}),
 "Customer service":()=>({"Staff error":.4,"Response delay":.4,"Policy applied correctly":.2}),"Card services":()=>({"Card delivery delay":.6,"System error":.4})};
function gen(seed,scale,lfi){const r=rng(seed),wp=o=>{let x=r()*Object.values(o).reduce((a,b)=>a+b,0);for(const[k,v]of Object.entries(o))if((x-=v)<=0)return k;return Object.keys(o)[0]};const out=[];let q=0;
 for(const[m,c0,dim]of[[4,38,31],[5,40,30],[6,42,31],[7,44,31],[8,58,30],[9,90,31]]){const late=m>=8,oct=m===9;for(let i=0;i<Math.round(c0*scale);i++){
  const cat=wp({"Fees & charges":oct?.44:late?.34:.2,"Rewards & cashback":.12,"Fraud & unauthorised":late?.17:.14,"Billing & statements":.14,"Collections":.09,"Customer service":.19,"Card services":.12});
  const cause=wp(CAUSES[cat](late)),day=1+Math.floor(r()*dim),cr=new Date(Date.UTC(2026,m,day)),pod=r()<.06?"Yes":"No";
  const ack=r()<(oct?.21:.12)?3+Math.floor(r()*4):Math.floor(r()*3);let dur=cat.startsWith("Fraud")?10+Math.floor(r()*45):2+Math.floor(r()*29);if(r()<.08)dur+=15;if(pod==="Yes")dur+=7;
  const open=oct&&day>14&&r()<.45,fav=!open&&r()<(cause.startsWith("Annual")?.9:cause.startsWith("Fraud claim")?.4:.55);
  const red=fav?(cause.startsWith("Annual")?100:cat.startsWith("Fraud")?Math.round((400+r()*5600)/10)*10:Math.round((25+r()*300)/5)*5):0;q++;
  out.push({sr:`SR-${lfi}-26-${String(1000+q)}`,created:iso(cr),cat,cause:!open&&r()<(oct?.66:.8)?cause:"Not recorded",_c:cause,pod,ack,dur,status:open?"Open":"Closed",red,rca:!open&&cause?"":"",written:open?"Pending":r()<.9?"Yes":"No",sanadak:r()<(cause.startsWith("Annual")&&oct?.1:.03)?"Yes":"No",court:r()<.006?"Yes":"No",nat:r()<.2?"UAE":"Expat",eid:"784-••••-•••••"+String(Math.floor(r()*90+10))+"-•"})}}
 out.forEach(c=>c.rca=c.cause==="Not recorded"?"No":"Yes");return out}
const CMP={A:gen(20261101,1,"A"),B:gen(7,.55,"B"),C:gen(11,.4,"C")};

/* =================== seeded findings =================== */
const FL=[
 {id:"F1",rule:"DIS-04",docs:["KFS","FEES"],st:"Fail",conf:96,xv:"AED 299 ≠ 399",th:"Equal across docs",lines:["KFS-FEE","FEES-AF"],imp:"Renewal billed AED 100 above KFS",act:"Confirm operative fee; correct docs; billing sample Sep–Oct",link:{cause:"Annual fee charged differs from KFS"},xc:"PREV",
  vb:["Re-read KFS p.2 and Fees p.4 — values unchanged","Same product, date, VAT basis, waiver — comparable","Δ AED 100 · Breach stands · confidence 96%"]},
 {id:"F2",rule:"DIS-06",docs:["KFS"],st:"Warning",conf:81,xv:"7.5 pt",th:"≥ 10 pt",lines:["KFS-LATE"],imp:"Fee less noticeable",act:"Equal prominence for all cost lines",vb:["Layout re-measured: 7.5 pt vs 10 pt for other costs","Flag stands — examiner to view rendered page"]},
 {id:"F3",rule:"RWD-02",docs:["KFS","RWD"],st:"Warning",conf:84,xv:"Cap/exclusion: absent",th:"Shown with benefit",lines:["KFS-RWD","RWD-CAP","RWD-EXCL"],imp:"Rewards over-estimated",act:"Add cap and exclusions next to headline",link:{cause:"Rewards cap/exclusion not clear"},xc:"MKT",vb:["KFS p.2 has no cap or exclusion wording","Rewards §3.2 and §3.4 contain both","Flag stands"]},
 {id:"F4",rule:"CRD-02",docs:["KFS"],st:"Warning",conf:79,xv:"Illustration: none",th:"Required",lines:["KFS-RISK"],imp:"Cost of minimum payments under-estimated",act:"Check statement for illustration",xc:"STM",vb:["Warning text present; no time/cost illustration in KFS","Statement sample would settle this"]},
 {id:"F5",rule:"LANG-01",also:"LANG-02",docs:["KFS","TNC","FEES","RWD"],st:"Insufficient",conf:58,xv:"AR docs: 0",th:"AR + EN",lines:[],imp:"—",act:"Fetch Arabic versions",xc:"AR",vb:["No Arabic documents in the review set","Missing upload ≠ non-availability — stays ungraded"]},
 {id:"F6",rule:"FRD-01",docs:["TNC"],st:"Fail",conf:95,xv:"Liability: unlimited",th:"Limited / fair",lines:["TNC-18.2"],imp:"Valid fraud claims declined",act:"Revise cl. 18.2; declined-claims sample",link:{cause:"Fraud claim declined under cl. 18.2"},vb:["Clauses 18.1–18.6 checked — no cap or fraud exception","Breach stands · confidence 95%"]},
 {id:"F7",rule:"CRD-10",docs:["TNC"],st:"Warning",conf:83,xv:"Notice: none",th:"Prior notice",lines:["TNC-16.3","TNC-14.3"],imp:"Rate rises without warning",act:"Add notice period for rate changes",vb:["Fees: 60-day notice (cl. 14.3)","Interest: no notice (cl. 16.3)","Flag stands"]},
 {id:"F8",rule:"FAIR-02",docs:["TNC"],st:"Warning",conf:85,xv:"Notice: none",th:"Prior notice",lines:["TNC-21.1"],imp:"Unexpected debits",act:"Require notice before set-off",vb:["Cl. 21.1 permits set-off without notice","Flag stands"]},
 {id:"F9",rule:"DATA-02",docs:["TNC"],st:"Warning",conf:82,xv:"Consent: bundled",th:"Specific",lines:["TNC-25.4"],imp:"Unclear data sharing",act:"Separate, specific consent",vb:["Consent implied by card use (cl. 25.4)","Flag stands"]},
 {id:"F10",rule:"FEE-04",docs:["FEES","KFS"],st:"Warning",conf:77,xv:"In KFS: no",th:"Disclosed",lines:["FEES-REP"],imp:"Low",act:"Examiner judgement on materiality",vb:["AED 50 replacement fee only in schedule","Flag stands"]},
 {id:"F11",rule:"FEE-05",docs:["FEES"],st:"Insufficient",conf:55,xv:"Limit table: n/a",th:"Mapped limits",lines:["FEES-OL"],imp:"—",act:"Activate fee-limit mapping",vb:["No active fee-limit table in the rule pack","Stays ungraded — upload a limits workbook in Setup"]},
 {id:"F12",rule:"RWD-03",docs:["RWD","KFS"],st:"Warning",conf:80,xv:"Expiry in KFS: no",th:"Prominent",lines:["RWD-EXP"],imp:"Points lost unknowingly",act:"Add expiry to KFS",vb:["24-month expiry only in Rewards §3.6","Flag stands"]},
 {id:"F13",rule:"RWD-04",docs:["RWD"],st:"Fail",conf:93,xv:"Notice: none",th:"Advance notice",lines:["RWD-7.1"],imp:"Accrued value lost without warning",act:"Advance notice for programme changes",link:{cat:"Rewards & cashback"},vb:["§7.1: amend/withdraw “at any time without notice”","Breach stands"]},
 {id:"G1",rule:"DIS-09",docs:["KFS","TNC"],st:"Insufficient",conf:61,xv:"Citation: unverified",th:"Verified quote",lines:[],guard:1,imp:"—",act:"Verify exception to correct citation",vb:["Agent cited KFS p.2 — quote not found on page","Re-searched all documents → found T&Cs p.3, cl. 4.2","Citation verified → Pass"],vs:"Pass",vl:["TNC-4.2"]}
];
const XC={PREV:{doc:"PREV",line:"PREV-AF",b:"Historical Fees Schedule (Nov 2025) shows AED 299 — schedule rose to AED 399 on 1 Sep 2026; KFS not updated"},
 MKT:{doc:"MKT",line:"MKT-1",b:"Brochure (Sep 2026) repeats “3X” with no cap — marketing review suggested (RWD-06)"},
 STM:{doc:"STM",line:"STM-EST",b:"Statement sample shows repayment estimate (38 months · AED 2,100)",s:"Pass"},
 AR:{doc:"AR",line:"AR-FEE",b:"Arabic KFS retrieved — annual fee AED 299 matches English KFS",s:"Pass"}};

const PLAIN={
 F1:{cmp:{a:["Key Facts","AED 299","KFS-FEE"],b:["Fee schedule","AED 399","FEES-AF"],delta:"Δ AED 100"},q:"Is the annual fee the same in every document?",plain:"Customers may pay AED 100 more than the summary says.",tiles:[["Key Facts","AED 299","KFS-FEE"],["Fee schedule","AED 399","FEES-AF"]],checks:["Same card","Same date (1 Sep 2026)","Same type of fee"]},
 F2:{cmp:{a:["Late fee text","7.5 pt","KFS-LATE"],b:["Other costs","10 pt",null],delta:"25% smaller"},q:"Is the late fee easy to see?",plain:"The fee is there, but in small print.",tiles:[["Late fee text","7.5 pt","KFS-LATE"],["Other costs","10 pt",null]],checks:["Text is smaller","Fee is still shown"]},
 F3:{cmp:{a:["Offer in KFS","3 pts / AED","KFS-RWD"],b:["Hidden limit","15,000 / cycle","RWD-CAP"],delta:"limit not shown"},q:"Are reward limits shown next to the offer?",plain:"Customers may expect more points than they get.",tiles:[["Offer","3 pts / AED","KFS-RWD"],["Limit","15,000 / cycle","RWD-CAP"],["Excluded","Food apps","RWD-EXCL"]],checks:["Offer is in the summary","Limit is only in the rewards terms"]},
 F4:{q:"Does the summary show the cost of paying the minimum?",plain:"Customers can't see how long minimum payments take.",tiles:[["Warning","Present","KFS-RISK"],["Example","Missing",null]],checks:["Warning is present","No time or cost example"]},
 F5:{q:"Were Arabic versions provided?",plain:"Can't tell yet — Arabic files weren't sent.",tiles:[["English","4 docs",null],["Arabic","0 docs",null]],checks:[]},
 F6:{q:"Is the customer's fraud liability fair?",plain:"Fraud victims may be refused refunds.",tiles:[["Clause 18.2","Liable for all","TNC-18.2"],["Expected","Limited",null]],checks:["Clause read correctly","No exception for fraud"]},
 F7:{cmp:{a:["Fee changes","60 days notice","TNC-14.3"],b:["Rate changes","No notice","TNC-16.3"],delta:"inconsistent"},q:"Are customers warned before interest rates change?",plain:"Rates can rise without warning.",tiles:[["Fees","60 days' notice","TNC-14.3"],["Interest","No notice","TNC-16.3"]],checks:["Fee notice exists","Rate notice is missing"]},
 F8:{q:"Are customers warned before money is taken from other accounts?",plain:"The bank can take money without telling the customer.",tiles:[["Clause 21.1","No notice","TNC-21.1"]],checks:["Clause read correctly"]},
 F9:{q:"Do customers agree specifically to data sharing?",plain:"Customers may not know who gets their data.",tiles:[["Clause 25.4","Bundled","TNC-25.4"]],checks:["Consent comes just from using the card"]},
 F10:{q:"Is every fee shown in the summary?",plain:"One small fee is missing from the summary.",tiles:[["Replacement fee","AED 50","FEES-REP"],["In summary","No",null]],checks:["Fee only in the schedule"]},
 F11:{q:"Are fees within the allowed limits?",plain:"Can't check — fee limits aren't loaded.",tiles:[["Limit table","Not loaded",null]],checks:[]},
 F12:{q:"Is point expiry easy to find?",plain:"Customers may lose points without knowing.",tiles:[["Expiry","24 months","RWD-EXP"],["In summary","No",null]],checks:["Expiry only in rewards terms"]},
 F13:{q:"Must the bank warn before changing rewards?",plain:"Rewards can be cut overnight.",tiles:[["Section 7.1","Any time, no notice","RWD-7.1"]],checks:["Clause read correctly"]},
 G1:{q:"Is there a cooling-off period?",plain:"AI said yes, but its quote didn't match the page — blocked until checked.",tiles:[["AI quote","Not on page",null]],checks:[]},
 C1:{q:"Are complaints answered within 2 days?",plain:"Some customers wait too long for a first reply.",checks:["Number matches Fusion DB records"]},
 C2:{q:"Are complaints fixed within 30 days?",plain:"Some complaints take too long to resolve.",checks:["Number matches Fusion DB records"]},
 C3:{q:"Is the cause of each complaint recorded?",plain:"Without causes, the bank can't fix repeat problems.",checks:["Number matches Fusion DB records"]},
 C4:{q:"Are customers told in writing about Sanadak?",plain:"Some customers may not know they can escalate.",checks:["Number matches Fusion DB records"]},
 C5:{q:"Are People of Determination helped faster?",plain:"They currently wait longer than others.",checks:["Number matches Fusion DB records"]},
 C6:{q:"Are fraud claims handled within 30 days?",plain:"Fraud victims wait too long for answers.",checks:["Number matches Fusion DB records"]}
};


/* =================== state =================== */
const S={ent:"A-MRC",role:"examiner",from:"2026-05-01",to:"2026-10-31",flags:[],dec:{},dr:{},extras:[],audit:[],
 up:{docs:{},rb:null,cmp:null},stage:"land",ran:false,running:false,chat:{},open:null,view:null,docF:null,sevF:"all",
 ints:false,ichat:[],inc:{},report:null,drawn:false,upT:null,busy:false,rangeK:"6M",closed:{}};
const E=()=>ENT[S.ent];
const lfiM=()=>E().mask;
const MNS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],MNL=["January","February","March","April","May","June","July","August","September","October","November","December"];
const RANGES={"2M":["2026-09-01","Last 2 months"],"3M":["2026-08-01","Last 3 months"],"6M":["2026-05-01","Last 6 months"]};
const periodTxt=long=>{const a=+S.from.slice(5,7)-1,b=+S.to.slice(5,7)-1,M=long?MNL:MNS;return a===b?`${M[a]} 2026`:`${M[a]}–${M[b]} 2026`};
const monthsIn=()=>{const out=[];for(let m=+S.from.slice(5,7);m<=+S.to.slice(5,7);m++)out.push(String(m).padStart(2,"0"));return out};
const log=(e,d="")=>S.audit.unshift({t:now(),who:{examiner:"Examiner",qa:"QA reviewer",supervisor:"Supervisor"}[S.role],e,d});
const range=()=>(CMP[S.ent[0]]||[]).filter(c=>c.created>=S.from&&c.created<=S.to);

/* =================== derived =================== */
function stats(L){const cl=L.filter(c=>c.status==="Closed"),sla=L.filter(c=>c.court!=="Yes"),avg=a=>a.length?a.reduce((s,c)=>s+c.dur,0)/a.length:0,fr=cl.filter(c=>c.cat.startsWith("Fraud"));
 return{n:L.length,fee:L.filter(c=>c.cat==="Fees & charges").length,closed:cl.length,avg:avg(cl),ack:pct(sla.filter(c=>c.ack<=2).length,sla.length),res:pct(cl.filter(c=>c.dur<=30).length,cl.length),
  san:L.filter(c=>c.sanadak==="Yes").length,red:L.reduce((s,c)=>s+c.red,0),redN:L.filter(c=>c.red).length,rca:pct(cl.filter(c=>c.rca==="Yes").length,cl.length),written:pct(cl.filter(c=>c.written==="Yes").length,cl.length),
  pod:avg(cl.filter(c=>c.pod==="Yes")),oth:avg(cl.filter(c=>c.pod==="No")),fraud:pct(fr.filter(c=>c.dur>30).length,fr.length)}}
function cmpFlags(){const s=stats(range()),F=[];const mk=(id,rule,st,xv,th,b)=>F.push({id,rule,docs:["CMP"],st,conf:100,xv,th,lines:[],metric:1,imp:"Complaint handling",act:"Provide MI and remediation plan",link:{all:1},vb:[b,"Deterministic metric — recomputed, unchanged"]});
 if(s.ack<97)mk("C1","CMP-01",s.ack<90?"Fail":"Warning",s.ack+"%","≥ 97%",`${s.ack}% acknowledged ≤ 2 days`);
 if(s.res<95)mk("C2","CMP-02",s.res<90?"Fail":"Warning",s.res+"%","≥ 95%",`${s.res}% resolved ≤ 30 days`);
 if(s.rca<90)mk("C3","CMP-03",s.rca<70?"Fail":"Warning",s.rca+"%","≥ 90%",`RCA recorded on ${s.rca}% of closed`);
 if(s.written<95)mk("C4","CMP-04",s.written<85?"Fail":"Warning",s.written+"%","≥ 95%",`Written outcome + Sanadak info ${s.written}%`);
 if(s.pod>s.oth+2)mk("C5","CMP-10","Warning",s.pod.toFixed(1)+" d","≤ "+s.oth.toFixed(1)+" d",`PoD ${s.pod.toFixed(1)} d vs others ${s.oth.toFixed(1)} d`);
 if(s.fraud>25)mk("C6","FRD-03",s.fraud>40?"Fail":"Warning",s.fraud+"% > 30 d","≤ 25%",`${s.fraud}% of fraud claims > 30 days`);return F}
const effSev=f=>({Critical:"H",Medium:"M",Low:"L"})[S.dec[f.id]?.tier]||R(f.rule).sev;
const eff=f=>{const d=S.dec[f.id];return d&&d.t==="override"?d.r:f.st};
const flagOf=rid=>S.flags.find(f=>f.rule===rid||f.also===rid);
const usable=r=>r.docs.some(d=>[...CORE,"CMP"].includes(d))||(r.docs.includes("AR")&&S.extras.includes("AR"))||(r.docs.includes("STM")&&S.extras.includes("STM"));
function res(r){const f=flagOf(r.id);if(f){const s=eff(f);if(f.also===r.id)return s==="Pass"?"Pass":"NA";return s}return usable(r)?"Pass":"NA"}
function rowData(r){const f=flagOf(r.id),s=res(r);
 if(f&&f.also!==r.id)return{r,f,s,xv:f.xv,th:f.th,conf:f.conf};
 if(s==="NA")return{r,s,xv:"—",th:"Other evidence",conf:null};
 const l=r.anchor?lineOf(r.anchor):null,m=r.docs.includes("CMP");
 return{r,s,xv:m?"Met":l?`Found · ${DOCS[l.d].n} p.${l.p}`:"Found",th:"Required",conf:m?100:88+hashN(r.id)%11}}
const BAND={4:"Good",3:"Minor issues",2:"Serious issues",1:"Critical"};
function dScore(d){const fl=S.flags.filter(f=>f.docs.includes(d)).map(f=>({f,s:eff(f),h:effSev(f)==="H"}));
 const hf=fl.filter(x=>x.s==="Fail"&&x.h),mf=fl.filter(x=>x.s==="Fail"&&!x.h),w=fl.filter(x=>x.s==="Warning");
 const sc=hf.length>=2?1:(hf.length||mf.length>=2)?2:(mf.length||w.length>=2)?3:4;
 const rules=RULES.filter(r=>r.docs.includes(d)),as=rules.filter(r=>["Pass","Fail","Warning"].includes(res(r))).length;
 const why=[hf.length&&`${hf.length} serious problem (${hf.map(x=>x.f.id)})`,mf.length&&`${mf.length} problem (${mf.map(x=>x.f.id)})`,w.length&&`${w.length} to check (${w.map(x=>x.f.id)})`].filter(Boolean).join(" · ")||"No problems found";
 return{sc,cov:pct(as,rules.length),as,n:rules.length,why,fl}}
const W={KFS:.3,TNC:.2,FEES:.2,RWD:.1,CMP:.2},DN={KFS:"Key Facts Statement",TNC:"Terms & Conditions",FEES:"Schedule of Fees",RWD:"Rewards Terms",CMP:"Complaints handling"};
function overall(){const ds=Object.keys(W).map(d=>[d,dScore(d)]);const v=Math.round(ds.reduce((s,[d,x])=>s+W[d]*x.sc,0)*10)/10;return{v,band:v>=3.5?4:v>=2.5?3:v>=1.5?2:1,ds}}
const cStat=f=>{const d=S.dec[f.id];if(d&&d.t==="need")return"Need more data";if(!d)return eff(f)==="Insufficient"?"Need more data":"Under review";return"Confirmed"};



/* =================== tiers =================== */
const TMAP={Critical:"H",Medium:"M",Low:"L"};
const TC={Critical:"crit",Medium:"med",Low:"low","Info needed":"mi",Cleared:"ok"};
function tier(f){const s=eff(f),d=S.dec[f.id];if(s==="Pass")return"Cleared";if(d?.tier)return d.tier;if(s==="Insufficient")return"Info needed";const v=R(f.rule).sev;return s==="Fail"?(v==="L"?"Medium":"Critical"):(v==="H"?"Medium":"Low")}
const tagH=t=>`<span class="tag t-${TC[t]}">${t}</span>`;
const DCOL={KFS:"#E6D7A2",TNC:"#D7BC6D",FEES:"#CBA344",RWD:"#B68A35"};
const docFindings=()=>S.flags.filter(f=>!f.metric);
const fDocs=f=>f.docs.filter(d=>CORE.includes(d));
const TORD={Critical:0,Medium:1,Low:2,"Info needed":3,Cleared:4};
const sorted=L=>[...L].sort((a,b)=>TORD[tier(a)]-TORD[tier(b)]||(+a.id.slice(1)||99)-(+b.id.slice(1)||99));
function stampKey(d){const k=d.k||(d.t==="need"?"need":d.t==="override"?(d.r==="Pass"?"reject":"adjust"):"confirm");return{confirm:["APPROVED",""],adjust:["ADJUSTED","adj"],reject:["REJECTED","rej"],need:["INFO REQUESTED","need"]}[k]}
const scK=n=>"k"+n;

/* =================== LANDING =================== */
const LN=[{k:"in",stack:[["up","📄","LFI documents","KFS · T&Cs · Fees · Rewards"],["rb","📘","Rulebook","Excel · 100 rules"],["cm","💬","Complaints","Excel · 30 fields"]]},
 {k:"db",ic:"🗄",t:"Fusion DB",s:"Stores every upload",cls:"hub"},{k:"ai",ic:"✦",t:"AI agent",s:"Extract · check · cite",cls:"core"},
 {k:"rv",ic:"⚖",t:"Examiner review",s:"Human decision on each finding"},
 {k:"out",stack:[["sc","📊","Scores","1–4 + complaints"],["lt","✉","Report","Select & generate"],["ap","⇩","Audit pack","Every step logged"]]}];
const NS={};// node states
function nodeH(k,ic,t,s,i,cls,sm){const st=NS[k]||"";return`<button class="fnode glass ${sm?"sm":""} ${cls||""} ${st}" data-node="${k}" style="--i:${i}" title="${esc(t)}"><span class="st">✓</span><span class="fi">${ic}</span>${sm?`<span><b>${t}</b><small>${s}</small></span>`:`<b>${t}</b><small>${s}</small><span class="live" id="lv-${k}"></span>`}</button>`}
function renderFlow(){let i=0;$("#flowx").classList.toggle("seen",!!S.flowSeen);if(!S.flowSeen)setTimeout(()=>{S.flowSeen=1},1700);$("#flowx").innerHTML=LN.map((n,x)=>(n.stack?`<div class="fstack">${n.stack.map(s=>nodeH(s[0],s[1],s[2],s[3],i++,"",1)).join("")}</div>`:nodeH(n.k,n.ic,n.t,n.s,i++,n.cls))+(x<LN.length-1?`<div class="conn" id="cn${x}" style="--i:${i}" aria-hidden="true"><i></i><i></i></div>`:"")).join("")}
function setNode(k,st,live){NS[k]=st;const b=$(`[data-node="${k}"]`);if(!b)return;b.classList.remove("done","act","wait");if(st)b.classList.add(st);if(live!==undefined){const l=$("#lv-"+k);if(l)l.textContent=live}}
const ready=()=>[CORE.every(d=>S.up.docs[d]),!!S.up.rb,!!S.up.cmp];
function syncInputNodes(){const[a,b,c]=ready();setNode("up",a?"done":"");setNode("rb",b?"done":"");setNode("cm",c?"done":"")}
function uploadPanel(){const[a,b,c]=ready(),n=CORE.filter(d=>S.up.docs[d]).length,all=a&&b&&c,seeded=ENT[S.ent].seeded;
 const fileRow=(u,ic,sub)=>`<div class="ufile"><span>${ic}</span><span class="sn"><b>${esc(u.name)}</b><small>${sub}</small></span><span class="saved">🗄 Saved</span></div>`;
 return`<div class="ups">
 <div class="glass upc ${a?"ok":""}"><h3>📄 LFI documents <span class="n">${n}/4</span></h3>
  <div class="prow"><label for="entSel">LFI · Fusion DB</label><select class="lsel" id="entSel" aria-label="Select LFI (masked)">${Object.entries(ENT).map(([k,e])=>`<option value="${k}" ${k===S.ent?"selected":""}>${e.mask} · ${e.prod}${S.closed[k]?" · last case closed":""}</option>`).join("")}</select></div>
  <div class="lfiinfo"><span>🏦 ${E().type}</span><span>Lic <b>${E().lic.replace(/\d(?=\d{2})/g,"•")}</b></span><span>${E().cards} cards</span><span>${(CMP[S.ent[0]]||[]).length} complaints on file</span><span>Last exam ${E().last}</span>${S.closed[S.ent]?`<span>Closed <b>${esc(S.closed[S.ent].case)}</b> · ${esc(S.closed[S.ent].at)}</span>`:""}</div>
  ${seeded?"":`<div class="lfinote">⚠ No seeded demo results for this LFI — select D••• B••• A to run the demo</div>`}
  <button class="drop" data-up="docs"><b>⇪ Drop or choose PDFs</b> · sorted by file name</button>
  <div class="slots">${CORE.map(d=>{const u=S.up.docs[d];return`<div class="slot ${u?"on":""}"><span class="si">${u?"✓":"+"}</span><span class="sn" title="${esc(u?u.name:DOCS[d].full)}">${DOCS[d].full}</span>${u?`<span class="saved">🗄</span>`:""}</div>`}).join("")}</div></div>
 <div class="glass upc ${b?"ok":""}"><h3>📘 Rulebook <span class="n">${b?"100 rules":"Excel"}</span></h3>
  ${b?fileRow(S.up.rb,"📗","100 rules · 10 themes · paraphrased demo pack"):`<button class="drop" data-up="rb"><b>⇪ Upload rulebook workbook</b><br>.xlsx · .xls · .csv</button><button class="btn sm" data-sample="rb">Use CBUAE demo pack v1.0</button>`}</div>
 <div class="glass upc ${c?"ok":""}"><h3>💬 Complaints data <span class="n">${c?range().length+" in period":"Excel"}</span></h3>
  ${c?fileRow(S.up.cmp,"📊",`30 fields · PII masked · ${(CMP[S.ent[0]]||[]).length} rows on file`)+periodPicker():`<button class="drop" data-up="cmp"><b>⇪ Upload complaints workbook</b><br>.xlsx · .xls · .csv</button><button class="btn sm" data-sample="cmp">Use sample extract</button>`}</div>
 </div>
 <div class="lgo"><span class="lhint"><span class="ready"><i class="${a?"on":""}"></i><i class="${b?"on":""}"></i><i class="${c?"on":""}"></i></span>${all?(seeded?"All inputs saved to Fusion DB":"Demo results exist only for Demo Bank A · Meridian Rewards"):`${[a,b,c].filter(Boolean).length} of 3 inputs ready`}</span>
  <button class="lbtn gold" id="start" ${all&&seeded?"":"disabled"}>✦ Start AI supervision investigation</button>
  ${all?"":`<button class="lbtn" id="sampleAll">⚡ Load full sample pack</button>`}</div>`}
function periodPicker(){return`<div class="prow"><label for="rangeSel">Period</label><select class="lsel" id="rangeSel">${Object.entries(RANGES).map(([k,v])=>`<option value="${k}" ${S.rangeK===k?"selected":""}>${v[1]} · ${MNS[+v[0].slice(5,7)-1]}–Oct 2026</option>`).join("")}<option value="custom" ${S.rangeK==="custom"?"selected":""}>Custom date range…</option></select></div>
 ${S.rangeK==="custom"?`<div class="prow"><input type="date" id="from" value="${S.from}" min="2026-05-01" max="2026-10-31" aria-label="From"><span class="mut">→</span><input type="date" id="to" value="${S.to}" min="2026-05-01" max="2026-10-31" aria-label="To"></div>`:""}
 <div class="pcount">${range().length} complaints selected · ${fmtD(S.from)} – ${fmtD(S.to)} 2026</div>`}
const RSTEPS=[["db","Saving uploads to Fusion DB"],["ai","Extracting text · 41 pages · OCR Fees p.9"],["ai","Loading rulebook · 100 rules"],["ai","Checking every rule against the documents"],["ai","Verifying citations & numbers"],["ai","Linking complaints to findings"],["ai","Scoring each document 1–4"]];
function runPanel(k){const done=k>=RSTEPS.length;return`<div class="glass runbox"><div><div class="kick">${done?"AI review complete":"AI supervision in progress"}</div><h3>${done?"Your turn, examiner":"Reviewing "+lfiM()+" · "+E().prod}</h3><div class="pbar"><i style="width:${Math.min(100,k/RSTEPS.length*100)}%"></i></div>
 ${done?`<div class="rsum">${(()=>{const L=docFindings(),c=t=>L.filter(f=>tier(f)===t).length;return`<span class="tag t-crit">${c("Critical")} critical</span><span class="tag t-med">${c("Medium")} medium</span><span class="tag t-low">${c("Low")} low</span><span class="tag t-mi">${c("Info needed")} info needed</span>`})()}</div>`:`<div class="xs mut" style="margin-top:8px">Demo results · no live model call</div>`}</div>
 <ul class="rsteps">${RSTEPS.map((s,i)=>`<li class="${i<k?"d":i===k?"r":""}"><span>${i<k?"✓":""}</span>${s[1]}</li>`).join("")}</ul></div>`}
function donePanel(){const o=overall(),n=docFindings().length,sd=docFindings().filter(f=>S.dec[f.id]).length;return`<div class="glass runbox"><div><div class="kick">Case ${E().case}</div><h3>${sd}/${n} findings signed off · LFI score ${o.v}/4</h3><div class="xs sub">All inputs stay in Fusion DB. Return to the investigation any time.</div></div><div class="lgo" style="margin:0;justify-content:flex-start"><button class="lbtn gold" id="backInv" style="animation:none">⚖ Back to investigation</button></div></div>`}
function renderPanel(){$("#lpanel").innerHTML=S.ran?donePanel():S.running?runPanel(S.rk||0):uploadPanel()}
function renderLanding(){renderFlow();if(S.ran){["up","rb","cm","db","ai"].forEach(k=>NS[k]="done");NS.rv=docFindings().every(f=>S.dec[f.id])?"done":"act";NS.sc=S.ints?"done":"";NS.lt=S.report?"done":"";NS.ap="";renderFlow()}else syncInputNodes();renderPanel()}

function addUpload(kind,file){const sz=Math.max(1,Math.round(file.size/1024))+" KB",o={name:file.name,size:sz,at:now()};
 if(kind==="rb"){S.up.rb=o;log("Rulebook uploaded · saved to Fusion DB",file.name)}
 else if(kind==="cmp"){S.up.cmp=o;log("Complaints workbook uploaded · saved to Fusion DB",file.name)}
 else{const n=file.name.toLowerCase(),k=/kfs|key.?fact/.test(n)?"KFS":/t&c|tnc|terms/.test(n)?"TNC":/fee/.test(n)?"FEES":/reward|rwd|loyal/.test(n)?"RWD":CORE.find(d=>!S.up.docs[d]);if(!k)return;S.up.docs[k]=o;log("Document uploaded · saved to Fusion DB",file.name)}}
function sample(kind){if(kind==="docs"||kind==="all")CORE.forEach((d,i)=>{if(!S.up.docs[d])S.up.docs[d]={name:E().seeded?DOCS[d].file:`${E().mask.replace(/[^A-Z]/g,"")}_${d}_EN_v2026-09.pdf`,size:[184,1210,402,226][i]+" KB",at:now()}});
 if((kind==="rb"||kind==="all")&&!S.up.rb)S.up.rb={name:"CBUAE_ConsumerProtection_RulePack_v1.0.xlsx",size:"88 KB",at:now()};
 if((kind==="cmp"||kind==="all")&&!S.up.cmp)S.up.cmp={name:`FusionDB_Complaints_${S.ent[0]}_2026.xlsx`,size:"146 KB",at:now()};
 if(kind==="all"){log("Sample pack loaded","4 documents · rulebook · complaints → Fusion DB")}}
function startRun(){if(!ready().every(Boolean))return;if(S.running)return;S.running=true;S.rk=0;log("AI review started",E().case);
 ["up","rb","cm"].forEach(k=>NS[k]="done");["db","ai","rv","sc","lt","ap"].forEach(k=>NS[k]="wait");renderFlow();renderPanel();
 const live={0:["db","4 docs · 1 rulebook"],1:["ai","41 pages"],2:["ai","100 rules"],3:["ai","rules 100/100"],4:["ai","citations ✓"],5:["ai",range().length+" complaints"],6:["ai","scores ready"]};
 const step=()=>{const k=S.rk;if(k===0){setNode("db","act","saving…");$("#cn0")?.classList.add("hot")}
  if(k===1){setNode("db","done",live[0][1]);setNode("ai","act","extracting…");$("#cn1")?.classList.add("hot")}
  if(k>1&&k<RSTEPS.length)setNode("ai","act",live[k-1][1]);
  if(k>=RSTEPS.length){setNode("ai","done","20 findings");$("#cn2")?.classList.add("hot");finish();setNode("rv","act");$("#lpanel").innerHTML=runPanel(k);setTimeout(transition,1300);return}
  $("#lpanel").innerHTML=runPanel(k);S.rk++;setTimeout(step,k===0?700:620)};step()}
function finish(){S.ran=true;S.running=false;S.flags=FL.map(f=>({...f,lines:[...f.lines]})).concat(cmpFlags());S.flags.forEach(f=>Object.assign(f,PLAIN[f.id]||{},{ticks:[]}));
 S.dec={};S.dr={};S.chat={};S.inc={};S.report=null;S.ints=false;S.ichat=[];S.drawn=false;S.stage="inv";log("AI review complete",`${S.flags.length} findings · seeded results`)}
function transition(){const b=$('[data-node="rv"]').getBoundingClientRect(),w=$("#wipe");w.style.setProperty("--x",(b.left+b.width/2)+"px");w.style.setProperty("--y",(b.top+b.height/2)+"px");w.className="";void w.offsetWidth;w.classList.add("go");
 setTimeout(()=>{$("#landing").classList.add("gone");$("#landing").style.display="none";$("#app").hidden=false;render();w.className="out";showIntro();setTimeout(()=>{w.className="";w.style.clipPath=""},700)},950)}
function showIntro(){const L=docFindings(),c=t=>L.filter(f=>tier(f)===t).length,d=document.createElement("div");d.className="intro";d.id="intro";
 d.innerHTML=`<div class="glass card"><div class="kick">Human decisions start now</div><h2>${L.length} findings across 4 documents</h2><div class="sub">Each line links a finding to the document it came from. Click a finding to see the evidence, ask the AI and sign off.</div><div class="row"><span class="tag t-crit">${c("Critical")} critical</span><span class="tag t-med">${c("Medium")} medium</span><span class="tag t-low">${c("Low")} low</span><span class="tag t-mi">${c("Info needed")} info needed</span></div><button class="btn gold" id="introGo">⚖ Start with the critical ones</button> <button class="btn" id="introX">Explore the map</button></div>`;
 document.body.appendChild(d)}
function openLanding(){$("#landing").style.display="";$("#landing").classList.remove("gone");renderLanding()}

/* =================== SHELL =================== */
const STG=[["land","Upload","1"],["run","AI review","2"],["inv","Investigate","3"],["score","Scores & complaints","4"],["rep","Report","5"]];
function header(){const o=overall(),dn=CORE.filter(d=>S.up.docs[d]).length;
 $("#top").innerHTML=`<div class="brand"><span class="logo"><img src="cbuae-logo.svg" alt="CBUAE" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><b>CBUAE</b></span><div class="bt"><b>Examination Findings Assistant</b><small>${lfiM()} · ${E().prod} · ${E().case}</small></div></div>
 <nav class="steps" aria-label="Workflow">${STG.map((s,i)=>`${i?'<span class="sep"></span>':""}<button data-stage="${s[0]}" class="${S.stage===s[0]?"on":""} ${i<2||(s[0]==="inv"&&docFindings().every(f=>S.dec[f.id]))?"done":""}"><span class="n">${i<2?"✓":s[2]}</span><span class="lb">${s[1]}</span></button>`).join("")}</nav>
 <div class="hright"><span class="score sc${o.band}" title="Weighted LFI score"><span>LFI</span><b>${o.v}</b><span>/ 4</span></span><button class="btn" id="dbBtn" title="Fusion DB">🗄 <span class="lb">Fusion DB</span></button><button class="btn" id="flowBtn" title="Process flow">◎ <span class="lb">Flow</span></button></div>`}
function render(){header();const m=$("#main");m.innerHTML=S.stage==="inv"?invStage():S.stage==="score"?scoreStage():repStage();if(S.stage==="inv")requestAnimationFrame(drawEdges)}

/* =================== INVESTIGATE (network) =================== */
function invStage(){const L=docFindings(),c=t=>L.filter(f=>tier(f)===t).length,sd=L.filter(f=>S.dec[f.id]).length,o=overall();
 const vis=f=>(S.sevF==="all"||tier(f)===S.sevF)&&(!S.docF||fDocs(f).includes(S.docF));
 return`<section class="stage"><div class="sbar"><h2>Investigate findings</h2><span class="hint">Hover a document to trace its findings · click a finding to decide</span><span class="sp"></span>
 <span class="seg" role="group" aria-label="Filter by rating">${[["all","All",L.length],["Critical","Critical",c("Critical")],["Medium","Medium",c("Medium")],["Low","Low",c("Low")],["Info needed","Info",c("Info needed")]].map(([k,l,n])=>`<button data-sev="${k}" aria-pressed="${S.sevF===k}">${k!=="all"?`<span class="c-${TC[k]}">●</span>`:""}${l}<i>${n}</i></button>`).join("")}</span>
 <span class="prog"><b>${sd}</b>/${L.length} signed<span class="pbar"><i style="width:${sd/L.length*100}%"></i></span></span>
 <button class="btn gold sm" id="nextOpen" ${sd===L.length?"disabled":""}>${sd===L.length?"All signed ✓":"⚖ Next to decide"}</button>${sd===L.length?`<button class="btn sm" data-stage="score">Scores →</button>`:""}</div>
 <div class="net" id="net"><svg id="edges" aria-hidden="true"></svg>
  <div class="ncol docs">${CORE.map((d,i)=>{const sc=dScore(d),fl=L.filter(f=>fDocs(f).includes(d)),n=t=>fl.filter(f=>tier(f)===t).length;
   return`<button class="dnode ${S.docF===d?"on":""}" data-doc="${d}" style="--i:${i};--dc:${DCOL[d]}"><span class="dic">${{KFS:"KFS",TNC:"T&amp;C",FEES:"FEE",RWD:"RWD"}[d]}</span><span class="dt"><b>${DOCS[d].full}</b><small>${DOCS[d].pg} · weight ${W[d]*100}% · ${fl.length} findings</small><span class="sevdots">${n("Critical")?`<span class="c-crit">${n("Critical")}</span>`:""}${n("Medium")?`<span class="c-med">${n("Medium")}</span>`:""}${n("Low")?`<span class="c-low">${n("Low")}</span>`:""}${n("Info needed")?`<span class="c-mi">${n("Info needed")}</span>`:""}${n("Cleared")?`<span class="c-ok">${n("Cleared")}</span>`:""}</span></span><span class="dsc ${scK(sc.sc)}" title="${esc(sc.why)}"><b>${sc.sc}</b><small>${BAND[sc.sc]}</small></span></button>`}).join("")}
   <div class="legend"><span>Score <b>4</b> Good · <b>3</b> Minor · <b>2</b> Serious · <b>1</b> Critical</span><span>LFI overall <b>${o.v}/4</b> · ${BAND[o.band]}</span></div></div>
  <div></div>
  <div class="ncol finds" id="finds">${sorted(L).map((f,i)=>{const t=tier(f),s=eff(f),d=S.dec[f.id],sk=d&&stampKey(d);
   return`<button class="fcard ${vis(f)?"":"lo"}" data-f="${f.id}" style="--i:${i}" ${vis(f)?"":'tabindex="-1"'}>${tagH(t)}<span class="ft"><b>${esc(f.q||R(f.rule).n)}</b><small><span class="fnd ${s}">${esc(f.xv)}</span>vs<span class="exp">${esc(f.th)}</span></small></span><span class="fr">${sk?`<span class="mst ${sk[1]}">${sk[0]}</span>`:`<span class="fid">${f.id}</span><span class="go">›</span>`}</span></button>`}).join("")}</div>
 </div></section>`}
function drawEdges(){const svg=$("#edges"),net=$("#net");if(!svg||!net||innerWidth<=900)return;const nb=net.getBoundingClientRect(),fb=$("#finds").getBoundingClientRect();
 const col={Critical:"#F87171",Medium:"#FB923C",Low:"#60A5FA","Info needed":"#A3AEC2",Cleared:"#34D399"};let h="",dots="",k=0;
 docFindings().forEach(f=>{const fc=$(`.fcard[data-f="${f.id}"]`);if(!fc||fc.classList.contains("lo"))return;const b=fc.getBoundingClientRect();let y2=b.top+b.height/2-nb.top;if(b.bottom<fb.top+4||b.top>fb.bottom-4)return;const x2=b.left-nb.left;
  fDocs(f).forEach(d=>{const db=$(`.dnode[data-doc="${d}"]`).getBoundingClientRect(),x1=db.right-nb.left,y1=db.top+db.height/2-nb.top,mx=(x1+x2)/2;
   h+=`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="${col[tier(f)]}" data-d="${d}" data-f="${f.id}" class="${S.drawn?"":"draw"}" style="--dl:${(k++)*.03+.3}s"/>`});
  dots+=`<circle cx="${x2}" cy="${y2}" r="3.5" fill="${col[tier(f)]}" data-f="${f.id}"/>`});
 CORE.forEach(d=>{const db=$(`.dnode[data-doc="${d}"]`).getBoundingClientRect();dots+=`<circle cx="${db.right-nb.left}" cy="${db.top+db.height/2-nb.top}" r="4.5" fill="${DCOL[d]}" data-d="${d}"/>`});
 svg.innerHTML=h+dots;if(!S.drawn)$$("#edges path").forEach(p=>p.style.setProperty("--len",Math.ceil(p.getTotalLength())));S.drawn=true;focusNet(S.docF?{d:S.docF}:null)}
function focusNet(o){const svg=$("#edges");if(!svg)return;$$(".dnode,.fcard").forEach(e=>e.classList.remove("hi"));if(!o){svg.classList.remove("focus");$$("#edges .hi").forEach(e=>e.classList.remove("hi"));return}
 svg.classList.add("focus");$$("#edges path,#edges circle").forEach(p=>{const on=o.d?p.dataset.d===o.d||(p.tagName==="circle"&&p.dataset.f&&fDocs(S.flags.find(x=>x.id===p.dataset.f)).includes(o.d)):p.dataset.f===o.f||(p.tagName==="circle"&&p.dataset.d&&fDocs(S.flags.find(x=>x.id===o.f)).includes(p.dataset.d));p.classList.toggle("hi",!!on)});
 if(o.d){$(`.dnode[data-doc="${o.d}"]`)?.classList.add("hi");docFindings().filter(f=>fDocs(f).includes(o.d)).forEach(f=>$(`.fcard[data-f="${f.id}"]`)?.classList.add("hi"))}
 if(o.f){$(`.fcard[data-f="${o.f}"]`)?.classList.add("hi");fDocs(S.flags.find(x=>x.id===o.f)).forEach(d=>$(`.dnode[data-doc="${d}"]`)?.classList.add("hi"))}}

/* =================== SHEET: finding detail + AI =================== */
const QN=["Verified against source","Matches complaint trend","Material customer impact","Bank to confirm position","Low impact — observation"];
const hiTrig=t=>esc(t).replace(TRIG,m=>`<mark>${m}</mark>`);
function openSheet(id){const f=S.flags.find(x=>x.id===id);if(!f)return;S.open=id;S.view=null;S.hlLine=null;$("#intro")?.remove();renderSheet();if(!S.chat[id]?.length)aiSay(f,"intro")}
function closeSheet(){S.open=null;$("#sheetHost").innerHTML="";render()}
function seq(){const L=S.stage==="score"?S.flags.filter(f=>f.metric):sorted(docFindings());return L.map(f=>f.id)}
function feViz(f){const s=eff(f);
 if(f.metric){const a=parseFloat(f.xv),t=parseFloat(String(f.th).replace(/[^\d.]/g,"")),isP=/%/.test(f.xv),max=isP?100:(Math.max(a,t)*1.3||1),g=a-t,u=isP?" pts":" days";
  return`<div class="gbar"><i class="${s}" style="width:${Math.min(100,a/max*100)}%"></i><span class="tgt" style="left:${Math.min(99,t/max*100)}%"><em>Target ${esc(f.th)}</em></span></div><div class="gl3"><span><small>Found</small><b class="c-${s==="Fail"?"crit":s==="Pass"?"ok":"med"}">${esc(f.xv)}</b></span><span class="gap">${g>0?"+":""}${g.toFixed(1)}${u} vs target</span><span style="text-align:right"><small>Expected</small><b>${esc(f.th)}</b></span></div>`}
 const vb=(x,cls)=>x[2]?`<button class="vbox ${cls}" data-line="${x[2]}"><small>${esc(x[0])}</small><b>${esc(x[1])}</b></button>`:`<div class="vbox ${cls}"><small>${esc(x[0])}</small><b>${esc(x[1])}</b></div>`;
 if(f.cmp&&s!=="Pass")return`<div class="fev">${vb(f.cmp.a,s)}<div class="neq"><span>≠</span><em>${esc(f.cmp.delta)}</em></div>${vb(f.cmp.b,s)}</div><div class="xs sub" style="text-align:center;margin:-4px 0 12px">Expected: <b>${esc(f.th)}</b></div>`;
 const ln=(s==="Pass"&&f.vl?f.vl:f.lines)[0];
 return`<div class="fev">${vb(["Found",f.xv,ln],s==="Pass"?"ok":s)}<div class="neq ${s==="Pass"?"ok":""}"><span>${s==="Pass"?"=":"≠"}</span><em>${s==="Pass"?"meets":s==="Insufficient"?"unknown":"gap"}</em></div>${vb(["Expected",f.th,null],"ok")}</div>`}
function evidence(f){const s=eff(f),ls=[...new Set([...(s==="Pass"&&f.vl?f.vl:[]),...f.lines,...(f.xl||[])])];
 if(f.metric)return`<div class="quote" style="font-family:var(--font)"><div class="src">🗄 Fusion DB · ${range().length} complaint records · ${fmtD(S.from)}–${fmtD(S.to)}</div>${esc(f.vb[0])}</div>`;
 if(!ls.length)return`<div class="quote" style="font-family:var(--font)"><div class="src">No matching text</div>Evidence is missing — this stays ungraded until the AI or the bank supplies it.</div>`;
 return ls.map(l=>{const x=lineOf(l);return x?`<div class="quote"><div class="src">📍 ${DOCS[x.d].full} · p.${x.p}<span class="sp"></span><button data-line="${l}">Open page ›</button></div><mark>${esc(x.t)}</mark></div>`:""}).join("")}
function docView(d,f){const D=DOCS[d],ls=f?[...f.lines,...(f.vl||[]),...(f.xl||[])]:[],col={Critical:"#B91C1C",Medium:"#C2410C",Low:"#1D4ED8","Info needed":"#475569",Cleared:"#047857"}[f?tier(f):"Critical"];
 const box=id=>ls.includes(id)?`bb" style="--bbc:${col}" data-tag="${f.id}`:"";
 const body=D.blocks?D.blocks.map(b=>b.h?`<h4>${esc(b.h)}</h4>`:b.m?`<div class="meta">${esc(b.m)}</div>`:b.s?`<div class="sec">${esc(b.s)}</div>`:`<div class="ln ${b.k?"kv2":""} ${b.small?"small":""} ${box(b.id)}" id="ln-${b.id}" ${b.rtl?'dir="rtl"':""}>${b.k?`<span class="k">${esc(b.k)}</span><span>${esc(b.v)}</span>`:`${b.c?`<span class="cn">${b.c}</span>`:""}${esc(b.t)}`}</div>`).join("")
  :`<h4>${esc(D.full)}</h4><div class="meta">${E().lfi} · ${E().prod}</div><table><thead><tr><th>Fee</th><th>Amount</th><th>Basis</th></tr></thead><tbody>${D.table.map(r=>`<tr class="${box(r[0])}" id="ln-${r[0]}"><td>${esc(r[1])}</td><td><b>${esc(r[2])}</b></td><td>${esc(r[3])}</td></tr>`).join("")}</tbody></table>`;
 return`<div class="lbl">📄 ${esc(D.full)}<span class="sp"></span><button class="btn sm" id="viewBack">← Finding</button></div><div class="page"><div class="phd"><span>${esc(D.file)}</span><span>${D.pg}</span></div>${body}</div><div class="xs mut" style="margin-top:6px">${esc(D.q)}</div>`}
function decisionHtml(f){const s=eff(f),d=S.dec[f.id],chk=f.checks||[];
 if(d){const k=stampKey(d);return`<div class="stampbox ${k[1]}"><div class="stamp">${k[0]}</div><dl class="kv"><dt>Rating</dt><dd>${tagH(tier(f))}</dd><dt>Signed</dt><dd>A. Rahman · ${esc(d.at)}</dd>${d.why?`<dt>Note</dt><dd>“${esc(d.why)}”</dd>`:""}</dl><div style="display:flex;gap:8px"><button class="btn sm" id="reopen">Reopen</button><span class="sp"></span><button class="btn gold sm" data-step="1">Next finding →</button></div></div>`}
 const at=tier(f),dr=S.dr[f.id]||(S.dr[f.id]={t:s==="Insufficient"?"need":"confirm",tier:["Critical","Medium","Low"].includes(at)?at:"Medium",r:s==="Fail"?"Warning":"Fail",why:s==="Insufficient"?f.act:""});
 const opts=s==="Insufficient"?[["need","📥 Request info"],["reject","✕ Not needed"]]:[["confirm","✅ Approve"],["adjust","✏️ Adjust"],["reject","✕ Reject"],["need","❓ Request info"]];
 const all=chk.every((_,k)=>f.ticks.includes(k)),ok=dr.t==="confirm"?all:(dr.why||"").trim().length>=5;
 return`<div class="dec"><div class="lbl" style="margin-bottom:8px">⚖ Examiner decision<span class="sp"></span><span class="xs mut" style="letter-spacing:0;text-transform:none;font-weight:500">AI proposed ${LBL[f.st]} · ${f.conf}%</span></div>
 <div class="aseg ${opts.length===2?"n2":""}" role="group">${opts.map(([k,l])=>`<button data-dt="${k}" aria-pressed="${dr.t===k}">${l}</button>`).join("")}</div>
 ${dr.t==="adjust"?`<div class="arow"><span class="xs">Result</span>${["Fail","Warning"].map(x=>`<button class="pillb res ${dr.r===x?"on":""}" data-dr="${x}">${LBL[x]}</button>`).join("")}</div>`:""}
 ${["confirm","adjust"].includes(dr.t)&&s!=="Pass"?`<div class="arow"><span class="xs">Rating</span>${["Critical","Medium","Low"].map(x=>`<button class="pillb ${TC[x]} ${dr.tier===x?"on":""}" data-dtier="${x}">${x}</button>`).join("")}</div>`:""}
 ${dr.t==="confirm"&&chk.length?`<div class="ticks">${chk.map((c,k)=>`<button class="tick ${f.ticks.includes(k)?"on":""}" data-tick="${k}"><span>${f.ticks.includes(k)?"✓":""}</span>${esc(c)}</button>`).join("")}</div>`:""}
 <textarea id="anote" placeholder="${dr.t==="confirm"?"Examiner note (optional)":"Note (required)"}">${esc(dr.why)}</textarea>
 <div class="qn">${QN.map(q=>`<button data-qn="${esc(q)}">+ ${esc(q)}</button>`).join("")}</div>
 <button class="btn gold sign" id="signOff" ${ok?"":"disabled"}>✍ Sign off finding</button>
 ${ok?"":`<div class="dhint">${dr.t==="confirm"?"Tick every check to approve":"Add a short note (5+ characters)"}</div>`}</div>`}
function chatHtml(f){const M=S.chat[f.id]||[];return M.map(m=>m.a?`<div class="m a"><div class="mh">✦ ${esc(m.h)}${m.v?` <span class="tag t-${m.vc||"mi"}">${esc(m.v)}</span>`:""}</div><ul>${m.b.map(b=>`<li>${esc(b.t)}${(b.c||[]).map(c=>`<button class="cc" data-line="${c}">${(()=>{const x=lineOf(c);return x?DOCS[x.d].n+" p."+x.p:c})()}</button>`).join("")}</li>`).join("")}</ul></div>`:`<div class="m u">${esc(m.t)}</div>`).join("")+(S.busy?`<div class="typing">✦ thinking<i></i><i></i><i></i></div>`:"")}
function renderSheet(){const f=S.flags.find(x=>x.id===S.open);if(!f)return;const t=tier(f),ids=seq(),i=ids.indexOf(f.id),r=R(f.rule),sc=$("#msgs")?.scrollTop;
 $("#sheetHost").innerHTML=`<div class="shbg" id="shbg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(f.q||r.n)}">
 <div class="shh"><span class="big ${TC[t]}">${ICON[eff(f)]}</span><div style="min-width:0"><div class="meta">${tagH(t)}<span class="mono">${f.id}</span>·<span>${r.theme}</span>·<span>${f.metric?"Complaints data":fDocs(f).map(d=>DOCS[d].n).join(" + ")}</span>${f.updated?`·<span class="c-ok">updated by AI</span>`:""}</div><h2>${esc(f.q||r.n)}</h2><p>${esc(f.plain||"")}</p></div>
  <div class="nav"><button class="btn sm" data-step="-1" ${i<=0?"disabled":""}>← Prev</button><span class="xs mut">${i+1}/${ids.length}</span><button class="btn sm" data-step="1" ${i>=ids.length-1?"disabled":""}>Next →</button><button class="x" id="shX" aria-label="Close">✕</button></div></div>
 <div class="shb"><div class="top2"><div id="tleft">${S.view?docView(S.view,f):`<div class="lbl">Found vs expected</div>${feViz(f)}<div class="lbl">Evidence</div>${evidence(f)}<dl class="kv"><dt>Customer impact</dt><dd>${esc(f.imp)}</dd><dt>Bank action</dt><dd>${esc(f.act)}</dd></dl>`}</div>
  <div><div class="rule"><div class="rh"><b>${r.id}</b><span style="font-weight:700">${esc(r.n)}</span><span class="tag t-${r.sev==="H"?"crit":r.sev==="M"?"med":"low"}">${SEV[r.sev]} severity</span></div><p>${hiTrig(r.t)}</p><a href="${RB_STD}" target="_blank" rel="noopener">CBUAE Rulebook ↗</a> <span class="xs mut">· paraphrased demo clause</span></div>${decisionHtml(f)}</div></div>
  <div class="chat"><div class="chh"><span class="av">✦</span><div><b>AI assistant</b><div class="xs mut">Scoped to ${f.id} · answers cite sources · it cannot approve or send</div></div>
   <div class="chips"><button data-ai="verify" ${S.busy?"disabled":""}>🔍 Verify exception</button><button data-ai="cross" ${S.busy?"disabled":""}>🗂 Cross-check complaints</button><button data-ai="explain" ${S.busy?"disabled":""}>💡 Explain simply</button><button data-ai="draft" ${S.busy?"disabled":""}>✎ Draft finding text</button></div></div>
   <div class="msgs" id="msgs">${chatHtml(f)}</div>
   <form class="ask" id="askF"><input id="askI" placeholder="Ask about ${f.id} — e.g. “what evidence supports this?”" autocomplete="off"><button class="btn gold">Ask</button></form><div class="disc">Synthetic demo · seeded answers · not a live model</div></div>
 </div></div></div>`;
 const ms=$("#msgs");ms.scrollTop=sc!=null&&!S.newMsg?sc:1e6;S.newMsg=false;if(S.view&&S.hlLine)document.getElementById("ln-"+S.hlLine)?.scrollIntoView({block:"center"})}
function aiSay(f,kind,q){S.chat[f.id]=S.chat[f.id]||[];if(q)S.chat[f.id].push({t:q});const intro=kind==="intro";if(!intro){S.busy=true;S.newMsg=true;renderSheet()}
 setTimeout(()=>{S.busy=false;S.chat[f.id].push(reply(f,kind,q));S.newMsg=true;if(S.open===f.id)renderSheet();if(kind!=="intro")log("AI assistant",`${f.id} · ${kind}`)},intro?0:750)}
function reply(f,kind,q){const L=range(),s=eff(f),r=R(f.rule),src=[...f.lines].slice(0,2);
 const linked=f.link?L.filter(c=>f.link.all?1:f.link.cause?c.cause===f.link.cause:c.cat===f.link.cat):[];
 if(kind==="intro")return{a:1,h:"Quick brief",b:[{t:`${LBL[f.st]} · ${f.conf}% confident · rule ${r.id} (${r.n}).`},{t:`Found ${f.xv}; expected ${f.th}.`,c:src},{t:"Tap a chip below, or ask me anything about this finding."}]};
 if(kind==="verify"){if(f.guard&&f.st!=="Pass"){f.st=f.vs;f.updated=1;delete S.dr[f.id];log("AI changed result",`${f.id} → OK (citation verified)`);return{a:1,h:"Verify exception",v:"Now OK",vc:"ok",b:f.vb.map((t,i)=>({t,c:i===2?f.vl:[]}))}}
  return{a:1,h:"Verify exception",v:LBL[s],vc:TC[tier(f)],b:f.vb.map((t,i)=>({t,c:i===0?src:[]}))}}
 if(kind==="cross"){const b=[];if(f.metric){const st=stats(L);b.push({t:`Recomputed from ${L.length} Fusion DB records — ${f.xv} vs target ${f.th}.`});b.push({t:`Fee complaints are ${pct(st.fee,st.n)}% of all; ${st.san} escalated to Sanadak.`});b.push({t:"Metric is deterministic — no model judgement involved."})}
  else{if(linked.length){const red=linked.reduce((a,c)=>a+c.red,0),late=linked.filter(c=>c.created>="2026-09-01").length;b.push({t:`${linked.length} complaints link to this finding (${f.link.cause?"“"+f.link.cause+"”":f.link.cat}).`});b.push({t:`${late} of them since 1 Sep 2026${red?` · ${aed(red)} returned to customers`:""}.`})}else b.push({t:"No complaint records link directly to this finding."});
   if(f.xc&&XC[f.xc]){const x=XC[f.xc];if(!S.extras.includes(x.doc))S.extras.push(x.doc);f.xl=[x.line];b.push({t:x.b,c:[x.line]});if(x.s&&f.st!==x.s){f.st=x.s;f.vl=[x.line];f.updated=1;delete S.dr[f.id];log("AI changed result",`${f.id} → ${LBL[x.s]} (extra evidence)`);return{a:1,h:"Cross-check Fusion DB",v:"Now "+LBL[x.s],vc:"ok",b}}}}
  return{a:1,h:"Cross-check Fusion DB",v:linked.length?linked.length+" complaints":"",vc:"mi",b}}
 if(kind==="explain")return{a:1,h:"In plain words",b:[{t:f.plain||r.t},{t:"Why it matters: "+f.imp},{t:"What the bank should do: "+f.act}]};
 if(kind==="draft"){const ev=[...f.lines].map(l=>{const x=lineOf(l);return x?`${DOCS[x.d].full} p.${x.p}`:""}).filter(Boolean).join("; ")||"Fusion DB complaint records";
  return{a:1,h:"Draft finding text",b:[{t:`${r.n} (${r.id}): ${f.metric?"Complaint data shows":"The documents show"} ${f.xv} where ${f.th} is expected.`},{t:`Customer impact: ${f.imp}.`},{t:`Required action: ${f.act}. Evidence: ${ev}.`}]}}
 const t=(q||"").toLowerCase();
 if(/evidence|source|where|page|quote/.test(t))return{a:1,h:"Evidence",b:[{t:f.lines.length?"The flagged text is highlighted on these pages:":"No direct quote — the evidence is missing.",c:src},{t:`Expected per ${r.id}: ${f.th}.`}]};
 if(/complain|customer|sanadak|refund/.test(t))return reply(f,"cross");
 if(/sever|critical|rating|serious|risk/.test(t))return{a:1,h:"Rating",b:[{t:`AI rating: ${tier(f)} — rule severity ${SEV[r.sev]}, result ${LBL[f.st]}.`},{t:f.link?"Complaints support the customer impact — keep the rating.":"No complaint link — consider whether impact is material."},{t:"You decide the final rating in the panel above."}]};
 if(/why|mean|explain|simple/.test(t))return reply(f,"explain");
 if(/letter|draft|write|word/.test(t))return reply(f,"draft");
 return{a:1,h:"Answer",b:[{t:`For ${f.id}: found ${f.xv}, expected ${f.th}.`,c:src},{t:f.plain||""},{t:"Try: “what evidence supports this?”, “is the rating right?”, or “show complaints”."}]}}
function signOff(f){const dr=S.dr[f.id],s=eff(f),why=($("#anote")?.value??dr.why??"").trim();dr.why=why;
 if(dr.t!=="confirm"&&why.length<5)return toast("Add a short note first");
 if(dr.t==="confirm"&&(f.checks||[]).some((_,k)=>!f.ticks.includes(k)))return toast("Tick every check first");
 const m={confirm:[{t:"confirm",tier:s==="Pass"?undefined:dr.tier},"Approved"],adjust:[{t:"override",r:dr.r,tier:dr.tier},"Adjusted"],reject:[{t:"override",r:s==="Pass"?"Fail":"Pass"},"Rejected"],need:[{t:"need"},"Info requested"]}[dr.t];
 S.dec[f.id]={...m[0],k:dr.t,why,at:now()};if(S.report)S.report.stale=1;log("Examiner decision",`${f.id} · ${m[1]}${why?" · “"+why+"”":""}`);toast(m[1]+" ✓");renderSheet();header();
 const nx=nextOpen(f.id);if(nx)setTimeout(()=>{if(S.open===f.id)openSheet(nx)},1100)}
function nextOpen(from){const ids=seq(),i=ids.indexOf(from);return[...ids.slice(i+1),...ids.slice(0,Math.max(i,0))].find(id=>!S.dec[id])}

/* =================== SCORES & COMPLAINTS =================== */
function interps(){const L=range(),st=stats(L);return S.flags.filter(f=>f.link&&!f.link.all&&!f.metric).map(f=>{const m=L.filter(c=>f.link.cause?c.cause===f.link.cause:c.cat===f.link.cat),red=m.reduce((a,c)=>a+c.red,0),late=m.filter(c=>c.created>="2026-09-01").length,early=m.length-late;
 const ms=monthsIn(),pm=ms.map(x=>m.filter(c=>c.created.slice(5,7)===x).length),lastM=pm[pm.length-1],prev=pm.slice(0,-1),avg=prev.length?prev.reduce((a,b)=>a+b,0)/prev.length:0,trend=ms.length<2?"in this period":lastM>avg*1.3?`rising — ${lastM} in ${MNS[+ms[ms.length-1]-1]}`:"steady";
 return{id:"I-"+f.id,f,n:m.length,red,late,trend,label:f.link.cause||f.link.cat,share:pct(m.length,st.n)}}).sort((a,b)=>b.n-a.n)}
function ring(v){const p=v/4,c=2*Math.PI*44;return`<svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10"/><circle cx="52" cy="52" r="44" fill="none" stroke="url(#gg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c*p} ${c}" transform="rotate(-90 52 52)" style="transition:stroke-dasharray .8s"/><defs><linearGradient id="gg"><stop offset="0" stop-color="#92722A"/><stop offset="1" stop-color="#E6D7A2"/></linearGradient></defs></svg>`}
function scoreStage(){const o=overall(),L=range(),st=stats(L),I=interps(),mf=S.flags.filter(f=>f.metric),mons=monthsIn(),MN=mons.map(m=>MNS[+m-1]);
 const mc=mons.map(m=>{const x=L.filter(c=>c.created.slice(5,7)===m);return[x.filter(c=>c.cat==="Fees & charges").length,x.length]}),mx=Math.max(...mc.map(x=>x[1]),1);
 const causes={};L.forEach(c=>{if(c.cause!=="Not recorded")causes[c.cause]=(causes[c.cause]||0)+1});const top=Object.entries(causes).sort((a,b)=>b[1]-a[1]).slice(0,6),cm=top[0]?.[1]||1,lk=new Set(I.map(x=>x.label));
 const nr=L.filter(c=>c.cause==="Not recorded").length;
 return`<section class="stage"><div class="sbar"><h2>Scores &amp; complaints</h2><span class="hint">Document scores update as you sign off · complaints come from Fusion DB (${fmtD(S.from)} – ${fmtD(S.to)} 2026)</span><span class="sp"></span><button class="btn gold sm" data-stage="rep">Build report →</button></div>
 <div class="s3">
 <div class="pane"><div class="ph"><b>📊 Finding scores</b><span class="sp"></span><span class="xs mut">1 Critical → 4 Good</span></div><div class="pb">
  <div class="gauge">${ring(o.v)}<div><div class="kick">Overall LFI score</div><div class="gv">${o.v}<span class="mut" style="font-size:16px"> / 4</span></div><span class="dsc sm ${scK(o.band)}"><b>${o.band}</b><small>${BAND[o.band]}</small></span></div></div>
  ${o.ds.map(([d,x])=>`<div class="drow"><span><b>${DN[d]}</b> <span class="w">× ${W[d]*100}%</span></span><span class="dsc sm ${scK(x.sc)}"><b>${x.sc}</b><small>${BAND[x.sc]}</small></span><span class="seg4">${[1,2,3,4].map(i=>`<i class="${i<=x.sc?"on"+x.sc:""}"></i>`).join("")}</span><span class="why">${esc(x.why)}</span></div>`).join("")}
  <div class="xs mut" style="margin-top:8px">Rules: 2+ critical problems → 1 · one critical or 2+ problems → 2 · one problem or 2+ checks → 3. Missing evidence is never scored.</div></div></div>
 <div class="pane"><div class="ph"><b>💬 Complaints data</b><span class="sp"></span><span class="xs mut">${L.length} records · PII masked</span></div><div class="pb">
  <div class="kpis"><div class="kpi"><small>Complaints</small><b>${st.n}</b><em class="${mc[mc.length-1][1]>mc[0][1]?"c-crit":"mut"}">${mc.length>1?`${mc[mc.length-1][1]>mc[0][1]?"▲":"▼"} ${MN[MN.length-1]} ${mc[mc.length-1][1]} vs ${MN[0]} ${mc[0][1]}`:periodTxt()}</em></div><div class="kpi warn"><small>Fee complaints</small><b>${pct(st.fee,st.n)}%</b><em class="mut">${st.fee} records</em></div><div class="kpi ${st.ack<90?"bad":st.ack<97?"warn":""}"><small>Acknowledged ≤ 2 days</small><b>${st.ack}%</b><em class="mut">target 97%</em></div>
   <div class="kpi ${st.res<90?"bad":st.res<95?"warn":""}"><small>Resolved ≤ 30 days</small><b>${st.res}%</b><em class="mut">target 95%</em></div><div class="kpi"><small>Sanadak escalations</small><b>${st.san}</b><em class="mut">external</em></div><div class="kpi"><small>Money returned</small><b>${(st.red/1000).toFixed(0)}k</b><em class="mut">AED · ${st.redN} cases</em></div></div>
  <div class="sub2" style="margin-top:4px">Monthly trend</div><div class="mbars">${mc.map((x,i)=>`<div><div class="stk" style="height:${x[1]/mx*100}%"><i class="f" style="height:${x[0]/(x[1]||1)*100}%"></i><i class="o" style="flex:1"></i></div>${MN[i]}</div>`).join("")}</div><div class="lg"><span>Fees &amp; charges</span><span>Other</span></div>
  <div class="sub2">Top recorded causes</div>${top.map(([k,v])=>`<div class="hb"><span title="${esc(k)}">${lk.has(k)?"🔗 ":""}${esc(k)}</span><span class="bar"><i class="${lk.has(k)?"lk":""}" style="width:${v/cm*100}%"></i></span><b>${v}</b></div>`).join("")}<div class="xs mut" style="margin-top:4px">🔗 linked to a document finding · ${nr} records have no recorded cause</div>
  <div class="sub2">Complaint-handling findings</div>${mf.map(f=>{const d=S.dec[f.id],sk=d&&stampKey(d);return`<button class="crow" data-f="${f.id}">${tagH(tier(f))}<span style="min-width:0"><b>${esc(f.q)}</b><small><span class="fnd ${eff(f)}">${esc(f.xv)}</span> vs <span class="exp">${esc(f.th)}</span></small></span>${sk?`<span class="mst ${sk[1]}">${sk[0]}</span>`:`<span class="go c-ok" style="color:var(--gold)">Decide ›</span>`}</button>`}).join("")||`<div class="xs mut">All complaint metrics meet target.</div>`}
 </div></div>
 <div class="pane"><div class="ph"><b>✦ AI interpretation</b><span class="sp"></span>${S.ints?`<span class="tag t-ok">Generated</span>`:""}</div><div class="pb ${S.iAnim?"anim":""}" id="ipb">${S.ints?interpHtml(I,st,o):`<div class="empty"><div class="big2">✦</div><b>How do the findings show up in complaints?</b><span class="xs">The AI links each critical finding to complaint records and explains what it means.</span><button class="btn gold" id="interp">✦ Interpret with AI</button></div>`}</div></div>
 </div></section>`}
function interpHtml(I,st,o){const crit=docFindings().filter(f=>tier(f)==="Critical");let i=0;
 return`<div class="sub2" style="margin-top:0">How findings connect to complaints</div>
 ${I.map(x=>`<div class="rel" style="animation-delay:${(i++)*.12}s"><button class="rf" data-f="${x.f.id}">${tagH(tier(x.f))}<b style="margin-top:3px">${esc(x.f.q)}</b><small>${x.f.id} · ${esc(x.f.xv)}</small></button><div class="rl"><span>${x.n} cases</span></div><div class="rc"><b>${esc(x.label)}</b><small>${x.share}% of complaints · ${x.trend}${x.red?" · "+aed(x.red)+" returned":""}</small></div></div>`).join("")}
 <div class="sub2">What it means</div>
 ${I.map(x=>`<div class="icard" style="animation-delay:${(i++)*.12}s"><div class="ih">${tagH(tier(x.f))}<b>${x.f.id} is visible in customer outcomes</b><button class="inc ${S.inc[x.id]!==false?"on":""}" data-inc="${x.id}"><i>${S.inc[x.id]!==false?"✓":""}</i>In report</button></div><p>${x.n} complaints (${x.share}%) trace to <b>“${esc(x.label)}”</b>, ${x.trend}${x.red?`; the bank returned <b>${aed(x.red)}</b>`:""}. ${esc(x.f.plain||"")} This supports the ${tier(x.f).toLowerCase()} rating.</p></div>`).join("")}
 <div class="icard" style="animation-delay:${(i++)*.12}s"><div class="ih"><span class="tag t-${st.ack<90?"crit":"med"}">Handling</span><b>Complaint handling is below target</b><button class="inc ${S.inc["I-HND"]!==false?"on":""}" data-inc="I-HND"><i>${S.inc["I-HND"]!==false?"✓":""}</i>In report</button></div><p>Only <b>${st.ack}%</b> acknowledged within 2 days (target 97%) and <b>${st.res}%</b> resolved within 30 days (target 95%). ${st.fraud}% of fraud claims took over 30 days.</p></div>
 <div class="sub2">Ask the AI</div><div class="qa">${["What's driving complaints?","Which finding harms customers most?","Is complaint handling adequate?","What should we sample?"].map(q=>`<button data-iq="${esc(q)}">${esc(q)}</button>`).join("")}</div>
 ${S.ichat.map(m=>m.a?`<div class="m a" style="max-width:100%"><div class="mh">✦ ${esc(m.h)}</div><ul>${m.b.map(b=>`<li>${esc(b)}</li>`).join("")}</ul></div>`:`<div class="m u" style="margin-left:auto">${esc(m.t)}</div>`).join("")}${S.busy?`<div class="typing">✦ thinking<i></i><i></i><i></i></div>`:""}
 <div class="xs mut" style="margin-top:8px">Critical findings: ${crit.map(f=>f.id).join(", ")||"none"} · interpretations are seeded demo text</div>`}
function iAnswer(q){const I=interps(),st=stats(range()),o=overall(),top=I[0];
 if(/driving/i.test(q))return{a:1,h:q,b:[`Fees & charges are ${pct(st.fee,st.n)}% of complaints and rose sharply from September.`,top?`Largest finding-linked driver: “${top.label}” — ${top.n} cases (${top.f.id}).`:"",(()=>{const a=I.find(x=>x.f.id==="F1");return a?`“${a.label}” (${a.n} cases) matches the AED 299 vs 399 mismatch in F1.`:""})()].filter(Boolean)};
 if(/harm/i.test(q)){const big=[...I].sort((a,b)=>b.red-a.red)[0];return{a:1,h:q,b:[big?`${big.f.id} has the largest money impact — ${aed(big.red)} returned across ${big.n} cases.`:"No money impact recorded.",`F6 (fraud liability) affects fraud victims directly even when counts are lower.`,`Overall LFI score ${o.v}/4 — ${BAND[o.band]}.`]}}
 if(/adequate/i.test(q))return{a:1,h:q,b:[`No — acknowledgement ${st.ack}% vs 97% and resolution ${st.res}% vs 95%.`,`Root cause recorded on ${st.rca}% of closed complaints (target 90%).`,`${st.san} customers escalated to Sanadak.`]};
 return{a:1,h:q,b:["Billing sample of renewals Sep–Oct 2026 to confirm the AED 399 charge (F1).","Declined fraud claims under clause 18.2 (F6).","Rewards programme change notices sent in 2026 (F13)."]}}

/* =================== REPORT =================== */
function repItems(){const B=[],O=[],Q=[];S.flags.forEach(f=>{const d=S.dec[f.id],s=eff(f);if(!d)return;if(d.t==="need"||s==="Insufficient")Q.push(f);else if(s==="Fail")B.push(f);else if(s==="Warning")O.push(f)});
 const st=stats(range()),I=S.ints?interps():[];return{B:sorted(B),O:sorted(O),Q,I,st}}
const incOn=(id,def=true)=>S.inc[id]===undefined?def:S.inc[id];
function repStage(){const{B,O,Q,I}=repItems(),un=S.flags.filter(f=>!S.dec[f.id]).length;
 const item=(id,t,title,sub,def)=>`<button class="ritem ${incOn(id,def)?"on":""}" data-inc="${id}"><span class="bx">${incOn(id,def)?"✓":""}</span>${t}<span style="min-width:0"><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`;
 const sec=(ic,n,L,fn)=>`<div class="rsec"><h4>${ic} ${n} <span class="c">${L.filter(x=>incOn(x.id||x,x.def)).length}/${L.length} selected</span></h4>${L.length?L.map(fn).join(""):`<div class="xs mut" style="padding:4px 0 6px">None yet</div>`}</div>`;
 return`<section class="stage"><div class="sbar"><h2>Generate report</h2><span class="hint">Pick what goes into the examiner letter — only signed-off findings can be included</span><span class="sp"></span>${S.report?`<span class="tag t-${S.report.stale?"med":"ok"}">v${S.report.v} · ${S.report.stale?"out of date":"generated "+esc(S.report.at)}</span>`:""}</div>
 <div class="s4"><div class="pane"><div class="ph"><b>☑ Select report items</b></div><div class="pb">
  ${un?`<div class="warnbar">⚠ <span class="sp">${un} finding${un>1?"s":""} not signed off yet — they can't go in the report.</span><button class="btn sm" data-stage="inv">Investigate</button></div>`:""}
  ${sec("🔴","Breaches",B,f=>item(f.id,tagH(tier(f)),f.q,`${f.id} · ${R(f.rule).id} · ${f.xv}`,true))}
  ${sec("🟠","Observations",O,f=>item(f.id,tagH(tier(f)),f.q,`${f.id} · ${R(f.rule).id} · ${f.xv}`,tier(f)!=="Low"))}
  ${sec("📥","Requests for information",Q,f=>item(f.id,`<span class="tag t-mi">Request</span>`,f.q,`${f.id} · ${(S.dec[f.id].why||f.act)}`,true))}
  ${sec("💬","Complaint analysis",[...I,{id:"I-HND"}].filter(x=>S.ints),x=>x.id==="I-HND"?item("I-HND",`<span class="tag t-med">Handling</span>`,"Complaint handling below target","Acknowledgement · resolution · fraud timeliness",true):item(x.id,tagH(tier(x.f)),`${x.f.id} ↔ ${x.label}`,`${x.n} complaints · ${x.share}%`,true))}
  ${S.ints?"":`<div class="xs mut" style="margin:-6px 0 12px">Run “Interpret with AI” on Scores &amp; complaints to add complaint analysis. <button class="btn sm" data-stage="score">Open</button></div>`}
  <div class="rsec"><h4>📊 Scores</h4>${item("SCORES",`<span class="tag t-ok">Table</span>`,"Document scores & overall LFI score","Weighted 1–4 scores with reasons",true)}</div>
  <div class="rbtns"><button class="btn gold" id="genRep">✦ ${S.report?"Regenerate":"Generate"} report</button><button class="btn" id="dlDoc" ${S.report?"":"disabled"}>⇩ Word (.doc)</button><button class="btn" id="dlPack">⇩ Audit pack</button><button class="btn" id="prt" ${S.report?"":"disabled"}>🖨 Print</button></div>
  ${S.report?`<div class="closebar">🔒 <span class="sp">${S.report.stale?"Selections changed — regenerate before closing.":`Report v${S.report.v} is ready. Close the investigation for <b>${lfiM()}</b>?`}</span><button class="btn gold sm" id="closeInv" ${S.report.stale?"disabled":""}>Close investigation</button></div>`:""}
  <div class="xs mut" style="margin-top:8px">The assistant drafts — the examiner and QA approve and send.</div>
 </div></div>
 <div class="pane"><div class="ph"><b>✉ Examiner letter · preview</b><span class="sp"></span><span class="xs mut">updates live</span></div><div class="pb" style="background:rgba(0,0,0,.18)">${letterHtml()}</div></div></div></section>`}
function letterHtml(){const{B,O,Q,I,st}=repItems(),o=overall(),b=B.filter(f=>incOn(f.id)),ob=O.filter(f=>incOn(f.id,tier(f)!=="Low")),q=Q.filter(f=>incOn(f.id)),ii=I.filter(x=>incOn(x.id)),hnd=S.ints&&incOn("I-HND");let n=0;
 const ev=f=>f.metric?"Fusion DB complaint records":[...f.lines].map(l=>{const x=lineOf(l);return x?`${DOCS[x.d].n} p.${x.p}`:""}).filter(Boolean).join(" · ");
 const li=f=>`<li><b>${esc(R(f.rule).n)}</b> (${R(f.rule).id}) — ${esc(f.q)} Found <b>${esc(f.xv)}</b>; expected ${esc(f.th)}. ${esc(f.imp)}. <i>Required action:</i> ${esc(f.act)}.${S.dec[f.id]?.why?` <i>Examiner note:</i> “${esc(S.dec[f.id].why)}”.`:""} <span class="ev">[${esc(ev(f))} · ${tier(f)}]</span></li>`;
 return`<div class="letter"><div class="wm">DRAFT · SYNTHETIC DEMO</div>
 <div class="lh"><div><b>CENTRAL BANK OF THE UAE</b><small>Banking Supervision · Market Conduct (demo)</small></div><div style="text-align:right"><small>Ref ${E().case}${S.report?` · v${S.report.v}`:""}<br>${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</small></div></div>
 <p>To: Compliance Officer, ${E().lfi}<br><b>Subject: Examination findings — ${E().prod} disclosures</b></p>
 <p>Our review of the Key Facts Statement, Terms &amp; Conditions, Schedule of Fees and Rewards Terms (effective 1 Sep 2026), together with complaint records for ${periodTxt(true)}, gives an overall score of <b>${o.v} / 4 (${BAND[o.band]})</b>. Please respond to each item within <b>30 days</b>.</p>
 ${b.length?`<h3>${++n}. Breaches</h3><ol>${b.map(li).join("")}</ol>`:""}
 ${ob.length?`<h3>${++n}. Observations</h3><ol>${ob.map(li).join("")}</ol>`:""}
 ${q.length?`<h3>${++n}. Requests for information</h3><ol>${q.map(f=>`<li>${esc(S.dec[f.id].why||f.act)} <span class="ev">[${f.id}]</span></li>`).join("")}</ol>`:""}
 ${ii.length||hnd?`<h3>${++n}. Complaint analysis</h3><ol>${ii.map(x=>`<li>${x.n} complaints (${x.share}%) relate to “${esc(x.label)}”, ${x.trend}${x.red?`; ${aed(x.red)} returned to customers`:""}. This supports finding ${x.f.id}.</li>`).join("")}${hnd?`<li>Complaint handling is below expectations: ${st.ack}% acknowledged within 2 days (target 97%); ${st.res}% resolved within 30 days (target 95%).</li>`:""}</ol>`:""}
 ${incOn("SCORES")?`<h3>${++n}. Document scores</h3><table><thead><tr><th>Document</th><th>Weight</th><th>Score</th><th>Reason</th></tr></thead><tbody>${o.ds.map(([d,x])=>`<tr><td>${DN[d]}</td><td>${W[d]*100}%</td><td><b>${x.sc}</b> ${BAND[x.sc]}</td><td>${esc(x.why)}</td></tr>`).join("")}</tbody></table>`:""}
 ${!b.length&&!ob.length&&!q.length?`<p style="color:#8C7B5A"><i>No signed-off findings selected yet.</i></p>`:""}
 <p style="margin-top:18px">Examiner (demo) · Market Conduct<br><span style="font-size:11px;color:#8C7B5A">Scores are internal demo grades, not official ratings. Synthetic data · seeded AI results.</span></p></div>`}
function closeDialog(){const o=overall(),L=docFindings().concat(S.flags.filter(f=>f.metric)),sd=L.filter(f=>S.dec[f.id]).length,d=$("#dlg");
 d.innerHTML=`<div class="dh">🔒 Close investigation · ${esc(E().case)}</div><div class="db"><table class="sumt"><tr><td>LFI</td><td><b>${lfiM()}</b> · ${esc(E().prod)}</td></tr><tr><td>Findings signed off</td><td>${sd} / ${L.length}${sd<L.length?` <span class="c-med">· ${L.length-sd} recorded as open</span>`:""}</td></tr><tr><td>Report</td><td>v${S.report.v} · ${esc(S.report.at)}</td></tr><tr><td>LFI score</td><td>${o.v} / 4 · ${BAND[o.band]}</td></tr><tr><td>Complaint period</td><td>${periodTxt()} · ${range().length} records</td></tr></table>
 <label class="ckrow"><input type="checkbox" id="ckPack" checked><span>Download the audit pack before closing</span></label>
 <label class="ckrow"><input type="checkbox" id="ckConf"><span>I confirm the investigation of <b>${lfiM()}</b> is complete and report v${S.report.v} is final. The workspace will reset for a new examination.</span></label></div>
 <div class="df"><button class="btn" id="dC">Cancel</button><button class="btn gold" id="dO" disabled>🔒 Close &amp; reset</button></div>`;
 $("#dC").onclick=()=>d.close();$("#ckConf").onchange=e=>$("#dO").disabled=!e.target.checked;
 $("#dO").onclick=()=>{const pack=$("#ckPack").checked;d.close();log("Investigation closed",`${E().case} · report v${S.report.v} · score ${o.v}`);if(pack)exportPack();closeCase(o)};d.showModal()}
function closeCase(o){const c=E().case;S.closed[S.ent]={case:c,at:now(),score:o.v};const m=c.match(/(\d+)$/);ENT[S.ent].case=c.replace(/\d+$/,String(+m[1]+1).padStart(m[1].length,"0"));
 const ov=document.createElement("div");ov.className="intro";ov.innerHTML=`<div class="glass card"><div class="kick">Case closed</div><h2>🔒 ${esc(c)} is closed</h2><div class="sub">${lfiM()} · score ${o.v}/4 · report v${S.report.v}<br>Returning to the start for a new examination…</div><div class="row"><div class="pbar" style="width:220px"><i id="rsb" style="width:0"></i></div></div></div>`;document.body.appendChild(ov);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{$("#rsb").style.transition="width 2s linear";$("#rsb").style.width="100%"}));
 setTimeout(()=>{resetAll();ov.remove()},2200)}
function resetAll(){Object.assign(S,{flags:[],dec:{},dr:{},extras:[],audit:[],up:{docs:{},rb:null,cmp:null},stage:"land",ran:false,running:false,chat:{},open:null,view:null,docF:null,sevF:"all",ints:false,ichat:[],inc:{},report:null,drawn:false,busy:false,rk:0,flowSeen:0,rangeK:"6M",from:"2026-05-01",to:"2026-10-31"});
 for(const k in NS)delete NS[k];$("#sheetHost").innerHTML="";$("#app").hidden=true;$("#main").innerHTML="";log("Ready for a new examination","");openLanding()}
function download(name,type,data){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function exportPack(){const o=overall();download(`DEMO_${E().case}_audit_pack.json`,"application/json",JSON.stringify({notice:"Synthetic demonstration · seeded results · not an official CBUAE record",generated:new Date().toISOString(),case:E().case,entity:E(),fusionDB:{documents:S.up.docs,rulebook:S.up.rb,complaints:S.up.cmp},score:{overall:o.v,band:BAND[o.band],documents:Object.fromEntries(o.ds.map(([d,x])=>[d,{score:x.sc,why:x.why}]))},findings:S.flags.map(f=>({id:f.id,rule:f.rule,ai:f.st,effective:eff(f),rating:tier(f),found:f.xv,expected:f.th,decision:S.dec[f.id]||null})),report:S.report,audit:S.audit},null,1));log("Audit pack exported","");toast("Audit pack downloaded ✓")}
function dlg({t,body,ok,fn}){const d=$("#dlg");d.innerHTML=`<div class="dh">${t}</div><div class="db">${body}</div><div class="df">${fn?`<button class="btn" id="dC">Close</button><button class="btn gold" id="dO">${ok}</button>`:`<button class="btn gold" id="dC">Close</button>`}</div>`;$("#dC").onclick=()=>d.close();if(fn)$("#dO").onclick=()=>{fn();d.close()};d.showModal()}
function dbDialog(){const L=range();dlg({t:"🗄 Fusion DB · stored for "+E().case,body:`${CORE.filter(d=>S.up.docs[d]).map(d=>`<div class="str"><span>📄</span><span class="sn"><b>${DOCS[d].full}</b><small>${esc(S.up.docs[d].name)} · ${S.up.docs[d].size}</small></span><span class="xs mut">${esc(S.up.docs[d].at)}</span></div>`).join("")}
 ${S.extras.map(d=>`<div class="str"><span>📎</span><span class="sn"><b>${DOCS[d].full}</b><small>Retrieved by AI cross-check</small></span><span class="tag t-ok">AI</span></div>`).join("")}
 ${S.up.rb?`<div class="str"><span>📘</span><span class="sn"><b>Rulebook · 100 rules</b><small>${esc(S.up.rb.name)}</small></span><span class="tag t-ok">Active</span></div>`:""}
 ${S.up.cmp?`<div class="str"><span>💬</span><span class="sn"><b>Complaints · ${L.length} records</b><small>${esc(S.up.cmp.name)} · 30 fields · PII masked</small></span></div>`:""}
 <div class="str"><span>🧾</span><span class="sn"><b>Audit trail · ${S.audit.length} events</b><small>${esc(S.audit[0]?.e||"")}</small></span></div>`})}

/* =================== EVENTS =================== */
container.addEventListener("click",e=>{const t=e.target.closest("button,[data-node]");if(!t||t.disabled)return;const d=t.dataset,f=S.open&&S.flags.find(x=>x.id===S.open);
 // landing
 if(d.up){S.upT=d.up;const fi=$("#fileIn");fi.accept=d.up==="docs"?".pdf,.docx":".xlsx,.xls,.csv";fi.multiple=d.up==="docs";fi.value="";return fi.click()}
 if(d.node&&!S.ran&&!S.running){if(d.node==="up")return $('[data-up="docs"]')?.click();if(d.node==="rb")return $('[data-up="rb"]')?.click()||sample("rb")||renderLanding();if(d.node==="cm")return $('[data-up="cmp"]')?.click()||sample("cmp")||renderLanding();return}
 if(d.node&&S.ran){const go={rv:"inv",sc:"score",lt:"rep",ap:"rep"}[d.node];if(go){S.stage=go;$("#landing").style.display="none";$("#app").hidden=false;return render()}return}
 if(d.sample){sample(d.sample);return renderLanding()}
 if(t.id==="sampleAll"){sample("all");return renderLanding()}
 if(t.id==="start")return startRun();
 if(t.id==="backInv"){$("#landing").style.display="none";$("#app").hidden=false;return render()}
 if(t.id==="introGo"){$("#intro").remove();const c=sorted(docFindings()).find(x=>!S.dec[x.id]);return c&&openSheet(c.id)}
 if(t.id==="introX")return $("#intro").remove();
 // shell
 if(d.stage){if(d.stage==="land"||d.stage==="run")return openLanding();S.stage=d.stage;if(S.open){S.open=null;$("#sheetHost").innerHTML=""}return render()}
 if(t.id==="flowBtn")return openLanding();
 if(t.id==="dbBtn")return dbDialog();
 // network
 if(d.sev){S.sevF=d.sev;S.drawn=true;return render()}
 if(d.doc&&t.classList.contains("dnode")){S.docF=S.docF===d.doc?null:d.doc;S.drawn=true;return render()}
 if(d.f)return openSheet(d.f);
 if(t.id==="nextOpen"){const c=sorted(docFindings()).find(x=>!S.dec[x.id]);return c&&openSheet(c.id)}
 // sheet
 if(t.id==="shX")return closeSheet();
 if(d.step&&f){const ids=seq(),i=ids.indexOf(f.id),j=i+ +d.step;if(ids[j])openSheet(ids[j]);return}
 if(d.line&&f){const x=lineOf(d.line);if(x){S.view=x.d;S.hlLine=d.line;renderSheet()}return}
 if(t.id==="viewBack"){S.view=null;return renderSheet()}
 if(d.ai&&f)return aiSay(f,d.ai);
 if(f&&S.dr[f.id]){const dr=S.dr[f.id],keep=()=>{const a=$("#anote");if(a)dr.why=a.value};
  if(d.dt){keep();dr.t=d.dt;if(dr.t==="need"&&!dr.why)dr.why=f.act;return renderSheet()}
  if(d.dr){keep();dr.r=d.dr;return renderSheet()}
  if(d.dtier){keep();dr.tier=d.dtier;return renderSheet()}
  if(d.qn){const a=$("#anote");dr.why=a&&a.value.trim()?a.value.trim().replace(/[;.]?$/,"; ")+d.qn:d.qn;return renderSheet()}
  if(d.tick){const k=+d.tick;f.ticks=f.ticks.includes(k)?f.ticks.filter(x=>x!==k):[...f.ticks,k];keep();return renderSheet()}}
 if(t.id==="signOff"&&f)return signOff(f);
 if(t.id==="reopen"&&f){delete S.dec[f.id];f.ticks=[];if(S.dr[f.id])S.dr[f.id].why="";log("Decision reopened",f.id);return renderSheet()}
 // scores
 if(t.id==="interp"){S.busy=true;$("#ipb").innerHTML=`<div class="empty"><div class="typing">✦ Linking ${range().length} complaints to ${docFindings().length} findings<i></i><i></i><i></i></div></div>`;setTimeout(()=>{S.busy=false;S.ints=true;S.iAnim=true;log("AI interpretation generated","complaints ↔ findings");render();S.iAnim=false},1200);return}
 if(d.iq){S.ichat.push({t:d.iq});S.busy=true;render();$("#ipb").scrollTop=1e6;setTimeout(()=>{S.busy=false;S.ichat.push(iAnswer(d.iq));render();$("#ipb").scrollTop=1e6},700);return}
 if(d.inc){const def=S.stage==="rep"?(()=>{const x=S.flags.find(y=>y.id===d.inc);return x&&eff(x)==="Warning"?tier(x)!=="Low":true})():true;S.inc[d.inc]=!incOn(d.inc,def);if(S.report)S.report.stale=1;const sc=$("#ipb")?.scrollTop;render();if(sc!=null&&$("#ipb"))$("#ipb").scrollTop=sc;return}
 // report
 if(t.id==="genRep"){S.report={v:(S.report?.v||0)+1,at:now(),stale:0};log("Report generated",`v${S.report.v}`);toast(`Report v${S.report.v} generated ✓`);return render()}
 if(t.id==="dlDoc"){download(`DEMO_${E().case}_examiner_letter_v${S.report.v}.doc`,"application/msword",`<html><head><meta charset="utf-8"></head><body>${letterHtml()}</body></html>`);log("Letter downloaded",`v${S.report.v}`);return toast("Letter downloaded ✓")}
 if(t.id==="dlPack")return exportPack();
 if(t.id==="prt")return print();
 if(t.id==="closeInv")return closeDialog();
});
container.addEventListener("click",e=>{if(e.target.id==="shbg")closeSheet()});
container.addEventListener("submit",e=>{if(e.target.id!=="askF")return;e.preventDefault();const v=$("#askI").value.trim(),f=S.flags.find(x=>x.id===S.open);if(v&&f&&!S.busy)aiSay(f,"free",v)});
container.addEventListener("input",e=>{if(e.target.id!=="anote")return;const f=S.flags.find(x=>x.id===S.open),dr=f&&S.dr[f.id];if(!dr)return;dr.why=e.target.value;const b=$("#signOff");if(b&&dr.t!=="confirm"){const ok=dr.why.trim().length>=5;b.disabled=!ok;const h=b.nextElementSibling;if(h&&h.classList.contains("dhint"))h.style.visibility=ok?"hidden":"visible"}});
container.addEventListener("change",e=>{if(e.target.id==="entSel"){S.ent=e.target.value;S.up.docs={};S.up.cmp=null;log("LFI selected",lfiM()+" · "+E().prod);return renderLanding()}
 if(e.target.id==="rangeSel"){S.rangeK=e.target.value;if(RANGES[S.rangeK]){S.from=RANGES[S.rangeK][0];S.to="2026-10-31"}log("Complaint period set",`${S.from} → ${S.to}`);return renderLanding()}
 if(e.target.id==="from"||e.target.id==="to"){const v=e.target.value;if(v){if(e.target.id==="from")S.from=v;else S.to=v;if(S.from>S.to)[S.from,S.to]=[S.to,S.from]}return renderLanding()}
 if(e.target.id==="fileIn"){[...e.target.files].forEach(f=>addUpload(S.upT,f));toast("Saved to Fusion DB ✓");renderLanding()}});
container.addEventListener("mouseover",e=>{if(S.stage!=="inv"||S.open)return;const n=e.target.closest(".dnode,.fcard");if(n===S._hov)return;S._hov=n;if(!n)return focusNet(S.docF?{d:S.docF}:null);focusNet(n.dataset.doc?{d:n.dataset.doc}:{f:n.dataset.f})});
container.addEventListener("scroll",e=>{if(e.target.id==="finds")drawEdges()},true);
addEventListener("resize",()=>{if(S.stage==="inv"&&!$("#app").hidden)drawEdges()});
container.addEventListener("keydown",e=>{if(e.key==="Escape"&&S.open&&!$("#dlg").open)closeSheet()});
["dragover","drop"].forEach(ev=>addEventListener(ev,e=>{e.preventDefault();if(ev==="drop"&&!S.ran&&!S.running&&e.dataTransfer?.files?.length){const z=e.target.closest("[data-up]");const kind=z?z.dataset.up:"docs";[...e.dataTransfer.files].forEach(f=>addUpload(/\.(xlsx|xls|csv)$/i.test(f.name)&&kind==="docs"?(/rule/i.test(f.name)?"rb":"cmp"):kind,f));toast("Saved to Fusion DB ✓");renderLanding()}}));
log("Assistant opened","Synthetic demo");
renderLanding();


    renderLanding();

    return () => {
      // cleanup
    };
    }
    