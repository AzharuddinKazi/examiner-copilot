import { ArrowRight, ArrowUpRight, FileText } from 'lucide-react';
import { Chrome, BankLogo, base } from './_shared/Chrome';
import { initialItems } from './_shared/data';
import './_group.css';

export function Briefing() {
  const titles = ['The annual borrowing rate is missing.', 'The late payment fee needs a clear amount.', 'The Arabic warning may not tell the same story.'];
  return <Chrome page="briefing"><main className="briefing-body">
    <div className="briefing-dateline"><span className="eyebrow">Your morning briefing <span style={{padding:'0 10px'}}> / </span> No. 046</span><span className="mono muted">THU, 12 NOV 2026 · 08:45 GST</span></div>
    <div className="briefing-layout"><section>
      <h1 className="memo-title">Three disclosures need your judgement.<br/>One draft notice is ready.</h1>
      <p className="intro">Good morning, Azharuddin. Start with the borrowing-cost disclosures at ADCB and Mashreq, then check an Arabic-language warning at ADIB. These are agent proposals, not confirmed breaches.</p>
      <div className="memo-divider"><span className="eyebrow">For your judgement</span><a className="text-link" href={`${base}TriageInbox`}>Open decision queue <span className="mono muted">07</span><ArrowRight size={14}/></a></div>
      {initialItems.slice(0,3).map((item,i)=><article key={item.id} className="priority">
        <span className="priority-num">0{i+1}</span><div>
          <div className="priority-top"><BankLogo bank={item.bank}/><h3>{item.bank} <span style={{fontWeight:400}}>{item.card}</span></h3><span className={`tag ${i<2?'attention':''}`}>{i<2&&<span className="dot"/>}{item.severity}</span></div>
          <h2>{titles[i]}</h2>
          <blockquote dir={i===2?'auto':undefined}>“{item.quote}”</blockquote>
          <div className="priority-bottom"><span className="mono muted">{item.code} <span style={{padding:'0 5px'}}>·</span> {item.doc} p. {item.page}</span><a href={`${base}TriageInbox?item=${item.id}`} className="text-link">Review evidence <ArrowUpRight size={14}/></a></div>
        </div>
      </article>)}
      <div className="memo-signoff"><span>Also in the queue: 1 rewards finding and 2 documents to assess.</span><a href={`${base}TriageInbox`} className="text-link">See all seven <ArrowRight size={13}/></a></div>
    </section><aside className="memo-aside">
      <section className="aside-section"><h2>Ready for your approval <span className="mono muted" style={{float:'right'}}>01</span></h2><div className="notice-preview"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><BankLogo bank="CBD"/><span className="tag">Draft only</span></div><h3>CBD Super Saver</h3><p className="aside-copy" style={{margin:'0 0 12px'}}>Request a clear minimum-payment warning in the KFS.</p><div className="mono muted" style={{fontSize:9}}>NOTICE N-008 · 11 NOV 2026</div></div><a className="text-link" href={`${base}TriageInbox?item=N-008`}>Read draft notice <ArrowRight size={13}/></a><p className="aside-copy" style={{fontSize:10,marginBottom:0}}>Your approval records a decision.<br/>No notice is sent from this workspace.</p></section>
      <section className="aside-section"><h2>Since your last review</h2><ul className="activity"><li>Two documents were added.<time>11 NOV · 17:26</time></li><li>Assessment completed against v3.<time>11 NOV · 16:52</time></li><li>CBD finding confirmed; notice drafted.<time>11 NOV · 16:38</time></li></ul><a className="text-link" href={`${base}TriageInbox?type=Document`}>View new documents <ArrowRight size={13}/></a></section>
      <section className="aside-section"><h2>The scope of this desk</h2><div className="bank-row">{['ADCB','ADIB','CBD','Mashreq'].map(bank=><BankLogo key={bank} bank={bank}/>)}</div><p className="aside-copy">Credit card disclosures · 6 products<br/>English and Arabic · Public / synthetic</p><div className="text-link muted" style={{fontSize:10}}><FileText size={12}/> Rulebook v3 · In force 1 Oct 2026</div></section>
    </aside></div>
  </main></Chrome>;
}
