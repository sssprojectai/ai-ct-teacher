/* AI-CT TEACHER application. Loaded by index.html and app/index.html */
/* =====================================================================
   UTILITIES
   ===================================================================== */
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const W=s=>(String(s||'').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)||[]).length;
const getPath=(o,p)=>p.split('.').reduce((a,k)=>a==null?a:a[k],o);
const setPath=(o,p,v)=>{const ks=p.split('.');let a=o;for(let i=0;i<ks.length-1;i++){if(a[ks[i]]==null)a[ks[i]]={};a=a[ks[i]]}a[ks[ks.length-1]]=v};
const excerpt=(s,n=110)=>{s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s};
const fmtDate=t=>new Date(t).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const fmtTime=t=>new Date(t).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
const uid=(p='x')=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const toks=s=>String(s||'').toLowerCase().match(/[\p{L}\p{N}']+/gu)||[];
const STOP=new Set('about after again against because before being between could during their there these those through under until where which while would should other really students student teacher class lesson english language think their them then than that this with from have what when will your into more some such also only over very much many most just like make made each both'.split(' '));
const contentSet=s=>new Set(toks(s).filter(t=>t.length>=5&&!STOP.has(t)));
const sharedCount=(a,b)=>{const A=contentSet(a),B=contentSet(b);let n=0;A.forEach(x=>{if(B.has(x))n++});return n};
const ngrams=(t,n)=>{const s=new Set();for(let i=0;i+n<=t.length;i++)s.add(t.slice(i,i+n).join(' '));return s};
function overlap(student,ai,n=4){const st=toks(student);if(st.length<n)return 0;const g=ngrams(st,n),a=ngrams(toks(ai),n);if(!g.size)return 0;let h=0;g.forEach(x=>{if(a.has(x))h++});return h/g.size}
const pct=(a,b)=>b?Math.round(a/b*100):0;
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;

let toastT=null;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.add('hidden'),2600)}

function modal({title,html,actions}){
  return new Promise(res=>{
    const ov=$('#overlay'),prev=document.activeElement;
    ov.innerHTML=`<div class="modal-bg" data-modal-bg><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mtitle"><h3 id="mtitle">${esc(title)}</h3><div>${html}</div><div class="row">${actions.map((a,i)=>`<button class="btn ${a.cls||''}" data-mi="${i}">${esc(a.label)}</button>`).join('')}</div></div></div>`;
    const done=v=>{ov.innerHTML='';document.removeEventListener('keydown',key);prev&&prev.focus&&prev.focus();res(v)};
    const key=e=>{if(e.key==='Escape')done(null)};
    document.addEventListener('keydown',key);
    ov.querySelector('[data-modal-bg]').addEventListener('click',e=>{if(e.target.hasAttribute('data-modal-bg'))done(null)});
    ov.querySelectorAll('[data-mi]').forEach(b=>b.addEventListener('click',()=>done(actions[+b.dataset.mi].val)));
    const first=ov.querySelector('[data-mi]:last-child');first&&first.focus();
  });
}
const confirmBox=(title,text,okLabel='Continue')=>modal({title,html:`<p>${esc(text)}</p>`,actions:[{label:'Cancel',cls:'quiet',val:false},{label:okLabel,val:true}]});

/* =====================================================================
   STATE + STORAGE  (localStorage, guarded; falls back to memory)
   ===================================================================== */
/* =====================================================================
   STATIC DATA — the AI-CT 4C cycle (Think → Ask AI → Check → Decide).
   Four stages, always in this order. The task bank (100 situations) is in
   data-tasks-*.js and the Source Library in data-sources.js.
   ===================================================================== */
const STAGES = [
  {n:1,key:'contextualize',name:'Contextualize',student:'Think',icon:'💭',next:'Ask AI',
   task:'Read the classroom situation. Choose the main problem and write what you would do, and why.'},
  {n:2,key:'consult',name:'Consult',student:'Ask AI',icon:'🤖',next:'Check',
   task:'Read the AI suggestion carefully. Some parts are good, some are not.'},
  {n:3,key:'critique',name:'Critique',student:'Check',icon:'🔍',next:'Decide',
   task:'Do you agree with the AI? Explain why, and check each statement against the Source Library.'},
  {n:4,key:'construct',name:'Construct',student:'Decide',icon:'✅',next:'AI feedback',
   task:'Write your final solution and compare it with your first opinion.'}
];

/* Criteria of the final AI feedback: five of the six core critical-thinking skills in the Delphi Report (Facione, 1990). Each is scored 1 to 5. */
const COMP = [
  {key:'analysis',name:'Analysis',about:'Seeing the real problem and its causes in the situation.'},
  {key:'evaluation',name:'Evaluation',about:'Judging which AI statements are supported and which are not.'},
  {key:'inference',name:'Inference',about:'Drawing conclusions that follow from the evidence that was checked.'},
  {key:'explanation',name:'Explanation',about:'Giving a clear solution with reasons.'},
  {key:'self',name:'Self-regulation',about:'Comparing the first and the final opinion and noticing what changed and why.'}
];
const LEVELS = ['','Beginning','Emerging','Developing','Proficient','Advanced'];
const VERDICT = {sup:{label:'Supported',cls:'g'},part:{label:'Partly supported',cls:'w'},not:{label:'Not supported',cls:'b'}};
const AGREE = [['agree','I agree'],['partly','I partly agree'],['disagree','I disagree']];
const CHANGE = [['none','Not changed'],['partly','Partly changed'],['completely','Completely changed']];
const TASKS = [];
/* =====================================================================
   SOURCE LIBRARY — published, citable works only. Every AI statement in
   every task links to one or more entries here.
   m: method / theory / finding   a: author(s)   y: year
   ref: full reference (APA style; <i> marks the title of the book or journal)
   idea: what the work says, in plain words (a summary, not a quotation)
   g: group shown on the Library page
   Before a defence, check each entry against the original work.
   ===================================================================== */
const SRC_GROUPS=[
 ['affect','Anxiety, motivation and confidence'],
 ['interaction','Interaction, tasks and methods'],
 ['grammar','Grammar, feedback and errors'],
 ['skills','Vocabulary, reading, listening, writing, pronunciation'],
 ['assessment','Assessment and feedback'],
 ['learning','How people learn'],
 ['class','Classroom practice and teacher development'],
 ['ai','AI and information'],
 ['ct','Critical thinking'],
 ['policy','Frameworks and documents']];
const SOURCES={
/* ---------- anxiety, motivation and confidence ---------- */
krashen1982:{g:'affect',m:'Affective Filter Hypothesis',a:'Stephen D. Krashen',y:1982,
 ref:'Krashen, S. D. (1982). <i>Principles and Practice in Second Language Acquisition</i>. Oxford: Pergamon Press.',
 idea:'Anxiety, low motivation and low self-confidence raise an “affective filter” that blocks comprehensible input. Learners acquire best in a low-anxiety classroom where they receive input they can understand.'},
horwitz1986:{g:'affect',m:'Foreign Language Classroom Anxiety',a:'Elaine K. Horwitz, Michael B. Horwitz, Joann Cope',y:1986,
 ref:'Horwitz, E. K., Horwitz, M. B., & Cope, J. (1986). Foreign language classroom anxiety. <i>The Modern Language Journal</i>, 70(2), 125–132.',
 idea:'Language anxiety is a specific kind of anxiety. It is linked to communication apprehension, test anxiety and fear of negative evaluation. The authors created the Foreign Language Classroom Anxiety Scale (FLCAS) to measure it.'},
macintyre1998:{g:'affect',m:'Willingness to Communicate (WTC)',a:'Peter D. MacIntyre, Richard Clément, Zoltán Dörnyei, Kimberly A. Noels',y:1998,
 ref:'MacIntyre, P. D., Clément, R., Dörnyei, Z., & Noels, K. A. (1998). Conceptualizing willingness to communicate in a L2: A situational model of L2 confidence and affiliation. <i>The Modern Language Journal</i>, 82(4), 545–562.',
 idea:'Whether a learner chooses to speak depends on many layers: confidence in that moment, the wish to talk to a particular person, motivation, personality and the social situation. Knowing the language is not enough.'},
dornyei2001:{g:'affect',m:'Motivational strategies',a:'Zoltán Dörnyei',y:2001,
 ref:'Dörnyei, Z. (2001). <i>Motivational Strategies in the Language Classroom</i>. Cambridge: Cambridge University Press.',
 idea:'Teachers can build motivation step by step: create basic conditions (a pleasant, supportive class), generate initial motivation, maintain and protect it during tasks, and help learners evaluate their progress positively.'},
ryan2000:{g:'affect',m:'Self-Determination Theory',a:'Richard M. Ryan, Edward L. Deci',y:2000,
 ref:'Ryan, R. M., & Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. <i>American Psychologist</i>, 55(1), 68–78.',
 idea:'Intrinsic motivation grows when three needs are met: autonomy (some choice), competence (a feeling of success) and relatedness (good relations with others). Controlling conditions weaken it.'},
deci1999:{g:'affect',m:'Extrinsic rewards and intrinsic motivation',a:'Edward L. Deci, Richard Koestner, Richard M. Ryan',y:1999,
 ref:'Deci, E. L., Koestner, R., & Ryan, R. M. (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. <i>Psychological Bulletin</i>, 125(6), 627–668.',
 idea:'A meta-analysis of 128 experiments. Expected tangible rewards given for doing a task reduced intrinsic motivation. Positive verbal feedback tended to increase it.'},
dweck2006:{g:'affect',m:'Growth mindset',a:'Carol S. Dweck',y:2006,
 ref:'Dweck, C. S. (2006). <i>Mindset: The New Psychology of Success</i>. New York: Random House.',
 idea:'People with a fixed mindset see ability as unchangeable; people with a growth mindset see it as something that develops with effort and good strategies. Praise for effort and strategy supports a growth mindset better than praise for being “clever”.'},
/* ---------- interaction, tasks and methods ---------- */
long1985:{g:'interaction',m:'Pair and group work',a:'Michael H. Long, Patricia A. Porter',y:1985,
 ref:'Long, M. H., & Porter, P. A. (1985). Group work, interlanguage talk, and second language acquisition. <i>TESOL Quarterly</i>, 19(2), 207–228.',
 idea:'Group and pair work increase the amount and variety of learner talk, let teachers individualise instruction, create a positive emotional climate and motivate learners.'},
long1996:{g:'interaction',m:'Interaction Hypothesis',a:'Michael H. Long',y:1996,
 ref:'Long, M. H. (1996). The role of the linguistic environment in second language acquisition. In W. C. Ritchie & T. K. Bhatia (Eds.), <i>Handbook of Second Language Acquisition</i> (pp. 413–468). San Diego: Academic Press.',
 idea:'When learners negotiate meaning in conversation (asking for clarification, checking understanding), they get input they can use, feedback and chances to notice gaps. Interaction supports acquisition.'},
swain1985:{g:'interaction',m:'Output Hypothesis',a:'Merrill Swain',y:1985,
 ref:'Swain, M. (1985). Communicative competence: Some roles of comprehensible input and comprehensible output in its development. In S. Gass & C. Madden (Eds.), <i>Input in Second Language Acquisition</i> (pp. 235–253). Rowley, MA: Newbury House.',
 idea:'Input alone is not enough. Learners also need to produce language (speak and write); producing it pushes them to notice what they cannot yet say and to try new forms.'},
johnson1989:{g:'interaction',m:'Cooperative learning',a:'David W. Johnson, Roger T. Johnson',y:1989,
 ref:'Johnson, D. W., & Johnson, R. T. (1989). <i>Cooperation and Competition: Theory and Research</i>. Edina, MN: Interaction Book Company.',
 idea:'Group work helps learning when it has positive interdependence, individual accountability, face-to-face interaction, social skills and group reflection. Putting students in groups without these conditions is not enough.'},
richards2006:{g:'interaction',m:'Communicative Language Teaching (CLT)',a:'Jack C. Richards',y:2006,
 ref:'Richards, J. C. (2006). <i>Communicative Language Teaching Today</i>. Cambridge: Cambridge University Press.',
 idea:'The goal of CLT is communicative competence: using language for real purposes, not only knowing rules. Typical activities are information gaps, role-plays and tasks; accuracy and fluency activities are balanced.'},
willis1996:{g:'interaction',m:'Task-Based Learning framework',a:'Jane Willis',y:1996,
 ref:'Willis, J. (1996). <i>A Framework for Task-Based Learning</i>. Harlow: Longman.',
 idea:'A lesson can follow three phases: a pre-task (topic and useful language), a task cycle (task, planning, report) and a language focus at the end. Learners use language to reach an outcome first and study form after.'},
ellis2003:{g:'interaction',m:'Task-Based Language Teaching (TBLT)',a:'Rod Ellis',y:2003,
 ref:'Ellis, R. (2003). <i>Task-based Language Learning and Teaching</i>. Oxford: Oxford University Press.',
 idea:'A “task” has a focus on meaning, some kind of gap, learners use their own language resources, and there is a clear outcome. Tasks can be adapted to many contexts and levels.'},
larsen2011:{g:'interaction',m:'Methods and their principles',a:'Diane Larsen-Freeman, Marti Anderson',y:2011,
 ref:'Larsen-Freeman, D., & Anderson, M. (2011). <i>Techniques and Principles in Language Teaching</i> (3rd ed.). Oxford: Oxford University Press.',
 idea:'The book describes the main methods (Grammar-Translation, Direct Method, Audio-Lingual Method, CLT, task-based teaching and others) with their techniques and principles, so that teachers can choose consciously instead of following one method blindly.'},
kumar2001:{g:'interaction',m:'Postmethod pedagogy',a:'B. Kumaravadivelu',y:2001,
 ref:'Kumaravadivelu, B. (2001). Toward a postmethod pedagogy. <i>TESOL Quarterly</i>, 35(4), 537–560.',
 idea:'Teaching should follow three parameters: particularity, practicality and possibility. Methods must fit the particular learners, teachers and local context; no single method works the same everywhere.'},
cook2001:{g:'interaction',m:'Using the first language in class',a:'Vivian Cook',y:2001,
 ref:'Cook, V. (2001). Using the first language in the classroom. <i>The Canadian Modern Language Review</i>, 57(3), 402–423.',
 idea:'Banning the first language is not supported by strong evidence. The L1 can be used deliberately and efficiently, for example to check meaning, explain grammar or organise tasks, while the L2 stays the main language.'},
garcia2014:{g:'interaction',m:'Translanguaging',a:'Ofelia García, Li Wei',y:2014,
 ref:'García, O., & Li Wei (2014). <i>Translanguaging: Language, Bilingualism and Education</i>. Basingstoke: Palgrave Macmillan.',
 idea:'Multilingual learners think with their whole language repertoire. Allowing them to use all their languages for learning can support understanding and participation.'},
/* ---------- grammar, feedback and errors ---------- */
lyster1997:{g:'grammar',m:'Corrective feedback and learner uptake',a:'Roy Lyster, Leila Ranta',y:1997,
 ref:'Lyster, R., & Ranta, L. (1997). Corrective feedback and learner uptake: Negotiation of form in communicative classrooms. <i>Studies in Second Language Acquisition</i>, 19(1), 37–66.',
 idea:'The study described six types of teacher feedback on errors. Recasts were the most frequent but led to the least learner uptake. Elicitation, clarification requests and metalinguistic clues led more often to learners correcting themselves.'},
ellis2009:{g:'grammar',m:'Corrective feedback: choices and timing',a:'Rod Ellis',y:2009,
 ref:'Ellis, R. (2009). Corrective feedback and teacher development. <i>L2 Journal</i>, 1(1), 3–18.',
 idea:'Ellis reviews the main questions about error correction: whether to correct, which errors, how and when (immediately or later). Teachers should adapt feedback to the learners and the activity, and watch for anxiety.'},
norris2000:{g:'grammar',m:'Effectiveness of explicit instruction',a:'John M. Norris, Lourdes Ortega',y:2000,
 ref:'Norris, J. M., & Ortega, L. (2000). Effectiveness of L2 instruction: A research synthesis and quantitative meta-analysis. <i>Language Learning</i>, 50(3), 417–528.',
 idea:'A meta-analysis of experimental studies. Focused second language instruction was effective, and explicit types of instruction produced larger effects than implicit types in these studies.'},
spada2008:{g:'grammar',m:'Form-focused instruction: isolated or integrated',a:'Nina Spada, Patsy M. Lightbown',y:2008,
 ref:'Spada, N., & Lightbown, P. M. (2008). Form-focused instruction: Isolated or integrated? <i>TESOL Quarterly</i>, 42(2), 181–207.',
 idea:'Attention to grammar can be given in separate lessons (isolated) or inside communicative activities (integrated). Both have a place; the choice depends on the learners and the language feature.'},
schmidt1990:{g:'grammar',m:'Noticing Hypothesis',a:'Richard W. Schmidt',y:1990,
 ref:'Schmidt, R. W. (1990). The role of consciousness in second language learning. <i>Applied Linguistics</i>, 11(2), 129–158.',
 idea:'Learners must consciously notice a language feature in the input for it to become intake. Teaching can help learners notice forms they would otherwise miss.'},
truscott1996:{g:'grammar',m:'The case against grammar correction in writing',a:'John Truscott',y:1996,
 ref:'Truscott, J. (1996). The case against grammar correction in L2 writing classes. <i>Language Learning</i>, 46(2), 327–369.',
 idea:'Truscott argued that research does not show that correcting grammar in students’ writing improves their accuracy and that it may even be harmful. The article started a long debate.'},
ferris1999:{g:'grammar',m:'The case for grammar correction in writing',a:'Dana Ferris',y:1999,
 ref:'Ferris, D. (1999). The case for grammar correction in L2 writing classes: A response to Truscott (1996). <i>Journal of Second Language Writing</i>, 8(1), 1–11.',
 idea:'Ferris answered that the evidence is too limited to reject correction. Clear, selective and consistent feedback, especially on patterns of errors, can help student writers.'},
/* ---------- skills ---------- */
nation2013:{g:'skills',m:'Four strands and vocabulary learning',a:'I. S. P. Nation',y:2013,
 ref:'Nation, I. S. P. (2013). <i>Learning Vocabulary in Another Language</i> (2nd ed.). Cambridge: Cambridge University Press.',
 idea:'A balanced course has four strands: meaning-focused input, meaning-focused output, language-focused learning and fluency development. Words are learned through many repeated meetings in different contexts.'},
laufer2001:{g:'skills',m:'Involvement Load Hypothesis',a:'Batia Laufer, Jan Hulstijn',y:2001,
 ref:'Laufer, B., & Hulstijn, J. (2001). Incidental vocabulary acquisition in a second language: The construct of task-induced involvement. <i>Applied Linguistics</i>, 22(1), 1–26.',
 idea:'Words are remembered better when a task creates need, search and evaluation, for example when learners must choose and use the word in their own sentence.'},
day1998:{g:'skills',m:'Extensive reading',a:'Richard R. Day, Julian Bamford',y:1998,
 ref:'Day, R. R., & Bamford, J. (1998). <i>Extensive Reading in the Second Language Classroom</i>. Cambridge: Cambridge University Press.',
 idea:'Learners read a lot of easy, interesting material that they choose themselves, for pleasure and general understanding. This builds reading fluency, vocabulary and positive attitudes.'},
field2008:{g:'skills',m:'Teaching listening as a process',a:'John Field',y:2008,
 ref:'Field, J. (2008). <i>Listening in the Language Classroom</i>. Cambridge: Cambridge University Press.',
 idea:'Many lessons only test listening with comprehension questions. Teachers should also teach the listening process, for example recognising words in connected speech and repairing misunderstandings.'},
vandergrift2012:{g:'skills',m:'Metacognitive listening instruction',a:'Larry Vandergrift, Christine C. M. Goh',y:2012,
 ref:'Vandergrift, L., & Goh, C. C. M. (2012). <i>Teaching and Learning Second Language Listening: Metacognition in Action</i>. New York: Routledge.',
 idea:'Learners improve when they learn to plan, monitor and evaluate their listening, for example by predicting, checking with a partner and reflecting on what made a text difficult.'},
derwing2005:{g:'skills',m:'Intelligibility in pronunciation teaching',a:'Tracey M. Derwing, Murray J. Munro',y:2005,
 ref:'Derwing, T. M., & Munro, M. J. (2005). Second language accent and pronunciation teaching: A research-based approach. <i>TESOL Quarterly</i>, 39(3), 379–397.',
 idea:'A foreign accent does not necessarily make speech hard to understand. Pronunciation teaching should aim at intelligibility and focus on the features that cause misunderstanding, not on a native-like accent.'},
hyland2003:{g:'skills',m:'Process and genre approaches to writing',a:'Ken Hyland',y:2003,
 ref:'Hyland, K. (2003). <i>Second Language Writing</i>. Cambridge: Cambridge University Press.',
 idea:'Writing develops through planning, drafting, feedback and revising, and through learning how texts of a genre are organised for their readers. One final product without drafts gives few chances to learn.'},
/* ---------- assessment ---------- */
black1998:{g:'assessment',m:'Formative assessment',a:'Paul Black, Dylan Wiliam',y:1998,
 ref:'Black, P., & Wiliam, D. (1998). Assessment and classroom learning. <i>Assessment in Education: Principles, Policy & Practice</i>, 5(1), 7–74.',
 idea:'A large review showed that formative assessment, using information about learning to adjust teaching and give feedback, can raise achievement, especially for lower-achieving learners.'},
hattie2007:{g:'assessment',m:'The power of feedback',a:'John Hattie, Helen Timperley',y:2007,
 ref:'Hattie, J., & Timperley, H. (2007). The power of feedback. <i>Review of Educational Research</i>, 77(1), 81–112.',
 idea:'Good feedback answers three questions: Where am I going? How am I going? Where to next? Feedback about the task, the process and self-regulation helps; praise about the person (“good girl”) has little effect on learning.'},
topping1998:{g:'assessment',m:'Peer assessment',a:'Keith Topping',y:1998,
 ref:'Topping, K. (1998). Peer assessment between students in colleges and universities. <i>Review of Educational Research</i>, 68(3), 249–276.',
 idea:'Peer assessment can be reliable and useful for learning when students are trained, criteria are clear and the teacher monitors the process.'},
jonsson2007:{g:'assessment',m:'Scoring rubrics',a:'Anders Jonsson, Gunilla Svingby',y:2007,
 ref:'Jonsson, A., & Svingby, G. (2007). The use of scoring rubrics: Reliability, validity and educational consequences. <i>Educational Research Review</i>, 2(2), 130–144.',
 idea:'Analytic rubrics with clear criteria and examples make scoring more reliable, especially when raters are trained, and they can support learning when students understand them.'},
alderson1993:{g:'assessment',m:'Washback',a:'J. Charles Alderson, Dianne Wall',y:1993,
 ref:'Alderson, J. C., & Wall, D. (1993). Does washback exist? <i>Applied Linguistics</i>, 14(2), 115–129.',
 idea:'Tests can influence what and how teachers teach and learners learn (washback), but the effect is complex and not automatic. It must be studied, not assumed.'},
brown2010:{g:'assessment',m:'Principles of classroom assessment',a:'H. Douglas Brown, Priyanvada Abeywickrama',y:2010,
 ref:'Brown, H. D., & Abeywickrama, P. (2010). <i>Language Assessment: Principles and Classroom Practices</i> (2nd ed.). White Plains, NY: Pearson Longman.',
 idea:'A good classroom test is practical, reliable, valid and authentic, and it has positive washback on learning. Teachers can check any test against these principles.'},
/* ---------- how people learn ---------- */
vygotsky1978:{g:'learning',m:'Zone of Proximal Development',a:'Lev S. Vygotsky',y:1978,
 ref:'Vygotsky, L. S. (1978). <i>Mind in Society: The Development of Higher Psychological Processes</i>. Cambridge, MA: Harvard University Press.',
 idea:'The zone of proximal development is the distance between what a learner can do alone and what they can do with help from a teacher or a more capable peer. Learning happens best in this zone.'},
wood1976:{g:'learning',m:'Scaffolding',a:'David Wood, Jerome S. Bruner, Gail Ross',y:1976,
 ref:'Wood, D., Bruner, J. S., & Ross, G. (1976). The role of tutoring in problem solving. <i>Journal of Child Psychology and Psychiatry</i>, 17(2), 89–100.',
 idea:'The authors introduced the term “scaffolding”: the tutor supports the parts of a task the learner cannot yet manage, and reduces the support as the learner becomes able to do it alone.'},
sweller1988:{g:'learning',m:'Cognitive Load Theory',a:'John Sweller',y:1988,
 ref:'Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. <i>Cognitive Science</i>, 12(2), 257–285.',
 idea:'Working memory is limited. When a task gives learners too much new information at once, learning suffers; materials should reduce unnecessary load.'},
roediger2006:{g:'learning',m:'Retrieval practice (testing effect)',a:'Henry L. Roediger, Jeffrey D. Karpicke',y:2006,
 ref:'Roediger, H. L., III, & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. <i>Psychological Science</i>, 17(3), 249–255.',
 idea:'Trying to recall information (for example in short low-stakes quizzes) leads to better long-term memory than reading the same material again.'},
cepeda2006:{g:'learning',m:'Spaced (distributed) practice',a:'Nicholas J. Cepeda, Harold Pashler, Edward Vul, John T. Wixted, Doug Rohrer',y:2006,
 ref:'Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. <i>Psychological Bulletin</i>, 132(3), 354–380.',
 idea:'Practice spread over several sessions gives better long-term retention than the same amount of practice in one block (cramming).'},
pashler2008:{g:'learning',m:'Learning styles: concepts and evidence',a:'Harold Pashler, Mark McDaniel, Doug Rohrer, Robert Bjork',y:2008,
 ref:'Pashler, H., McDaniel, M., Rohrer, D., & Bjork, R. (2008). Learning styles: Concepts and evidence. <i>Psychological Science in the Public Interest</i>, 9(3), 105–119.',
 idea:'The review found no adequate evidence that matching teaching to a learner’s preferred “learning style” (for example visual or auditory) improves learning.'},
anderson2001:{g:'learning',m:'Revised Bloom’s Taxonomy',a:'Lorin W. Anderson, David R. Krathwohl (Eds.)',y:2001,
 ref:'Anderson, L. W., & Krathwohl, D. R. (Eds.). (2001). <i>A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom’s Taxonomy of Educational Objectives</i>. New York: Longman.',
 idea:'Cognitive processes are ordered as remember, understand, apply, analyse, evaluate and create. Teachers can use the levels to plan questions and tasks that go beyond memory.'},
/* ---------- classroom practice ---------- */
rowe1986:{g:'class',m:'Wait time',a:'Mary Budd Rowe',y:1986,
 ref:'Rowe, M. B. (1986). Wait time: Slowing down may be a way of speeding up! <i>Journal of Teacher Education</i>, 37(1), 43–50.',
 idea:'When teachers wait about three seconds or more after a question, students give longer and better answers and more students take part.'},
tomlinson2014:{g:'class',m:'Differentiated instruction',a:'Carol Ann Tomlinson',y:2014,
 ref:'Tomlinson, C. A. (2014). <i>The Differentiated Classroom: Responding to the Needs of All Learners</i> (2nd ed.). Alexandria, VA: ASCD.',
 idea:'Teachers can differentiate content, process and product according to students’ readiness, interests and learning profiles, while keeping the same learning goals for the class.'},
ur2012:{g:'class',m:'Practical teaching of mixed-level classes',a:'Penny Ur',y:2012,
 ref:'Ur, P. (2012). <i>A Course in English Language Teaching</i> (2nd ed.). Cambridge: Cambridge University Press.',
 idea:'A practical course for teachers. It discusses differences between learners and gives techniques for mixed-level classes, such as open-ended tasks, optional extra parts and individual choice.'},
harmer2015:{g:'class',m:'Practice of English Language Teaching',a:'Jeremy Harmer',y:2015,
 ref:'Harmer, J. (2015). <i>The Practice of English Language Teaching</i> (5th ed.). Harlow: Pearson.',
 idea:'A standard methodology handbook covering learners, classroom management, teaching the four skills, grammar, vocabulary, pronunciation, feedback and testing, with practical techniques for each.'},
marzano2003:{g:'class',m:'Research-based classroom management',a:'Robert J. Marzano',y:2003,
 ref:'Marzano, R. J. (2003). <i>Classroom Management That Works: Research-Based Strategies for Every Teacher</i>. Alexandria, VA: ASCD.',
 idea:'Effective management rests on clear rules and procedures, fair consequences, good teacher–student relationships and the teacher’s awareness of what is happening in class.'},
cooper2006:{g:'class',m:'Homework and achievement',a:'Harris Cooper, Jorgianne Civey Robinson, Erika A. Patall',y:2006,
 ref:'Cooper, H., Robinson, J. C., & Patall, E. A. (2006). Does homework improve academic achievement? A synthesis of research, 1987–2003. <i>Review of Educational Research</i>, 76(1), 1–62.',
 idea:'Homework was generally linked with higher achievement, and the link was stronger in secondary school than in primary school. More homework is not always better.'},
schon1983:{g:'class',m:'Reflective practice',a:'Donald A. Schön',y:1983,
 ref:'Schön, D. A. (1983). <i>The Reflective Practitioner: How Professionals Think in Action</i>. New York: Basic Books.',
 idea:'Professionals learn by reflecting in action (while working) and on action (afterwards). Reflection turns experience into better decisions.'},
burns2010:{g:'class',m:'Action research',a:'Anne Burns',y:2010,
 ref:'Burns, A. (2010). <i>Doing Action Research in English Language Teaching: A Guide for Practitioners</i>. New York: Routledge.',
 idea:'Teachers can study their own classroom problems in cycles of planning, acting, observing and reflecting, and change their teaching based on what they find.'},
hamari2014:{g:'class',m:'Does gamification work?',a:'Juho Hamari, Jonna Koivisto, Harri Sarsa',y:2014,
 ref:'Hamari, J., Koivisto, J., & Sarsa, H. (2014). Does gamification work? A literature review of empirical studies on gamification. In <i>Proceedings of the 47th Hawaii International Conference on System Sciences</i> (pp. 3025–3034). IEEE.',
 idea:'Most reviewed studies found some positive effects of points, badges and leaderboards, but the effects depended on the context and on the users. Gamification is not automatically effective.'},
/* ---------- AI and information ---------- */
kasneci2023:{g:'ai',m:'Large language models in education: opportunities and risks',a:'Enkelejda Kasneci and colleagues',y:2023,
 ref:'Kasneci, E., Seßler, K., Küchemann, S., Bannert, M., Dementieva, D., Fischer, F., … Kasneci, G. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. <i>Learning and Individual Differences</i>, 103, 102274.',
 idea:'Language models can support learning, for example by explaining and giving feedback, but they bring risks: biased or wrong output, over-reliance, and privacy issues. Teachers and learners need competence to use them critically.'},
ji2023:{g:'ai',m:'AI hallucination',a:'Ziwei Ji and colleagues',y:2023,
 ref:'Ji, Z., Lee, N., Frieske, R., Yu, T., Su, D., Xu, Y., … Fung, P. (2023). Survey of hallucination in natural language generation. <i>ACM Computing Surveys</i>, 55(12), Article 248.',
 idea:'Text generators often produce fluent output that is not faithful to the source or not true (“hallucination”). Fluency is not a sign of accuracy.'},
walters2023:{g:'ai',m:'Fabricated citations from ChatGPT',a:'William H. Walters, Esther Isabelle Wilder',y:2023,
 ref:'Walters, W. H., & Wilder, E. I. (2023). Fabrication and errors in the bibliographic citations generated by ChatGPT. <i>Scientific Reports</i>, 13, 14045.',
 idea:'When ChatGPT was asked to write short literature reviews, a large share of its citations were fabricated, and many real ones had errors. GPT-4 fabricated fewer than GPT-3.5, but still some. Every AI citation must be checked.'},
liang2023:{g:'ai',m:'Bias of AI-text detectors',a:'Weixin Liang, Mert Yuksekgonul, Yining Mao, Eric Wu, James Zou',y:2023,
 ref:'Liang, W., Yuksekgonul, M., Mao, Y., Wu, E., & Zou, J. (2023). GPT detectors are biased against non-native English writers. <i>Patterns</i>, 4(7), 100779.',
 idea:'Several popular AI detectors wrongly labelled many essays by non-native English writers (TOEFL essays) as AI-generated, while essays by native writers were judged mostly correctly.'},
weberwulff2023:{g:'ai',m:'Accuracy of AI-text detection tools',a:'Debora Weber-Wulff and colleagues',y:2023,
 ref:'Weber-Wulff, D., Anohina-Naumeca, A., Bjelobaba, S., Foltýnek, T., Guerrero-Dib, J., Popoola, O., Šigut, P., & Waddington, L. (2023). Testing of detection tools for AI-generated text. <i>International Journal for Educational Integrity</i>, 19, 26.',
 idea:'The researchers tested 14 detection tools and found that none was accurate and reliable enough; results got worse when the AI text was edited or paraphrased. Detector scores should not be used as proof of cheating.'},
unesco2023:{g:'ai',m:'Guidance for generative AI in education',a:'UNESCO',y:2023,
 ref:'UNESCO. (2023). <i>Guidance for Generative AI in Education and Research</i>. Paris: UNESCO.',
 idea:'UNESCO recommends a human-centred approach: protect learners’ data and privacy, check AI content, build AI competences of teachers and students, and set age-appropriate rules for use.'},
wineburg2019:{g:'ai',m:'Lateral reading',a:'Sam Wineburg, Sarah McGrew',y:2019,
 ref:'Wineburg, S., & McGrew, S. (2019). Lateral reading and the nature of expertise: Reading less and learning more when evaluating digital information. <i>Teachers College Record</i>, 121(11), 1–40.',
 idea:'Professional fact-checkers quickly leave an unfamiliar website and check what other sources say about it (lateral reading). They judged reliability faster and better than historians and students who read only the site itself.'},
/* ---------- critical thinking ---------- */
facione1990:{g:'ct',m:'Critical thinking skills (Delphi Report)',a:'Peter A. Facione',y:1990,
 ref:'Facione, P. A. (1990). <i>Critical Thinking: A Statement of Expert Consensus for Purposes of Educational Assessment and Instruction</i> (The Delphi Report). Millbrae, CA: The California Academic Press.',
 idea:'A panel of experts agreed on six core critical thinking skills: interpretation, analysis, evaluation, inference, explanation and self-regulation, together with dispositions such as open-mindedness and inquisitiveness.'},
halpern1998:{g:'ct',m:'Teaching critical thinking for transfer',a:'Diane F. Halpern',y:1998,
 ref:'Halpern, D. F. (1998). Teaching critical thinking for transfer across domains: Dispositions, skills, structure training, and metacognitive monitoring. <i>American Psychologist</i>, 53(4), 449–455.',
 idea:'Critical thinking can be taught. Transfer to new situations needs explicit teaching of skills, practice with many different problems, attention to dispositions and monitoring of one’s own thinking.'},
/* ---------- frameworks and documents ---------- */
coe2001:{g:'policy',m:'Common European Framework of Reference (CEFR)',a:'Council of Europe',y:2001,
 ref:'Council of Europe. (2001). <i>Common European Framework of Reference for Languages: Learning, Teaching, Assessment</i>. Cambridge: Cambridge University Press.',
 idea:'The CEFR describes language ability at six levels (A1–C2) with “can-do” descriptors. It is a reference framework for planning and assessment, not a syllabus or a test.'},
coe2020:{g:'policy',m:'CEFR Companion Volume',a:'Council of Europe',y:2020,
 ref:'Council of Europe. (2020). <i>Common European Framework of Reference for Languages: Learning, Teaching, Assessment – Companion Volume</i>. Strasbourg: Council of Europe Publishing.',
 idea:'The Companion Volume updates the CEFR descriptors and adds new ones, including mediation and plurilingual and pluricultural competence.'},
pq1875:{g:'policy',m:'Foreign languages from Grade 1 in Uzbekistan',a:'President of the Republic of Uzbekistan',y:2012,
 ref:'Resolution of the President of the Republic of Uzbekistan No. PQ-1875 of 10 December 2012 “On measures to further improve the system of learning foreign languages”. Available at lex.uz.',
 idea:'The resolution introduced foreign language learning, mainly English, from the first grade from the 2013/2014 school year, in the form of games and oral activities in the early grades, and called for modern methods and multimedia resources.'},
pdlaw2019:{g:'policy',m:'Personal data protection in Uzbekistan',a:'Republic of Uzbekistan',y:2019,
 ref:'Law of the Republic of Uzbekistan No. ZRU-547 of 2 July 2019 “On Personal Data”. Available at lex.uz.',
 idea:'The law regulates the collection, storage and use of personal data. As a general rule, personal data may be processed and shared only with the consent of the person (or a legal representative), and it must be protected.'}
};
const SRC_KEYS=Object.keys(SOURCES);
/* short in-text label: "Krashen, 1982", "Horwitz et al., 1986" */
function srcShort(k){const s=SOURCES[k];if(!s)return k;
  if(/^(UNESCO|Council of Europe|President|Republic)/.test(s.a))return (s.a==='Republic of Uzbekistan'?'Law ZRU-547':s.a.startsWith('President')?'PQ-1875':s.a)+', '+s.y;
  const names=s.a.replace(/ and colleagues$/,'').replace(/ \(Eds\.\)$/,'').split(/,\s*/);
  const last=n=>n.trim().split(' ').slice(-1)[0];
  const many=names.length>2||/and colleagues/.test(s.a);
  return (many?last(names[0])+' et al.':names.length===2?last(names[0])+' & '+last(names[1]):last(names[0]))+', '+s.y}
/* =====================================================================
   TASKS 1–25. Real problem situations from schools, lyceums, learning
   centres and universities in Uzbekistan. The people and places are
   invented examples. Each AI statement has a verdict and Library sources:
   sup = supported, part = partly supported, not = not supported.
   ===================================================================== */
TASKS.push(
{id:'t1',title:'The silent Grade 9 group',skill:'Speaking',level:'A2',
 ctx:'You are doing your teaching practice at a state general secondary school in Samarkand region. In a Grade 9 English group, most students stay silent during speaking activities. When one student tries to speak, others laugh at the mistakes. Many of them say they want to pass the national Multilevel (CEFR) exam. The course book has many grammar exercises, and your mentor teacher says: “They just do not want to speak.” You must plan the next four lessons.',
 facts:[['Group','16 students, ages 14–15'],['Level','A2'],['Lessons','45 minutes'],['Goal','Multilevel (CEFR) exam']],
 q:['What is the main problem?',['Students are lazy','Students may feel unsafe or anxious about speaking','The lessons are too short'],1,'Silence and laughing at mistakes point to fear of mistakes, not laziness.'],
 ai:[['Reluctance to speak is almost always caused by low proficiency, so the teacher should first teach more vocabulary and grammar before asking students to speak.','not',['horwitz1986','macintyre1998'],'Anxiety, fear of negative evaluation and confidence also decide whether learners speak. Knowing more words is not enough.'],
  ['Research shows that 90% of students speak more when the teacher corrects every error immediately.','not',['lyster1997','ellis2009'],'No study with this figure exists. Research on feedback says type and timing must fit the learners and the activity.'],
  ['Start with structured pair work with clear roles and short time limits, so students speak in a low-risk setting before whole-class talk.','sup',['long1985'],'Pair work increases learner talk and creates a more positive emotional climate.'],
  ['Use role-plays with scripted dialogues and remove the scripts step by step as confidence grows.','sup',['wood1976'],'This is scaffolding: support is given and then reduced as learners become able.'],
  ['Give points for every English sentence so that motivation becomes high in every class.','part',['deci1999','hamari2014'],'Rewards may help for a short time, but expected rewards can lower intrinsic motivation, and their effect depends on the class.'],
  ['These steps work in all classrooms, whatever the class size, culture or age.','not',['kumar2001'],'Methods must fit the particular learners and context.']],
 sol:[['Lower anxiety first: agree a class rule about mistakes and stop laughing at errors.',['krashen1982','horwitz1986']],['Begin with short pair tasks before any whole-class speaking.',['long1985']],['Use scripted dialogues as a scaffold and remove them step by step.',['wood1976']],['In fluency tasks, delay correction and focus on a few key errors.',['ellis2009']]]},

{id:'t2',title:'The same three hands',skill:'Speaking',level:'A2–B1',
 ctx:'In a Grade 7 class in a Tashkent school, you ask the class questions during the lesson. The same three students always raise their hands and answer at once. The others look down at their books. Your mentor says this is normal: “Strong students answer, weak students listen.” You notice that you usually call on someone one second after you ask the question.',
 facts:[['Class','28 students, ages 12–13'],['Level','A2–B1'],['Pattern','3 students answer every question'],['Your habit','Call on someone almost at once']],
 q:['What is the main problem?',['The class is too big for questions','Most students get no time or chance to think and answer','The questions are too easy'],1,'Quick turn-taking lets only the fastest students answer.'],
 ai:[['Wait at least three seconds after a question before calling on anyone; more students will be ready to answer.','sup',['rowe1986'],'Longer wait time leads to longer answers and more students taking part.'],
  ['Let students first discuss the answer with a partner for 30 seconds, then ask some pairs to share.','sup',['long1985'],'Pair talk gives every student speaking time and a safer step before speaking to the class.'],
  ['Weak students learn equally well by listening to strong students, so there is no need to change anything.','not',['swain1985','long1996'],'Learners also need to produce language and interact; listening alone is not enough.'],
  ['Only ask questions that have one short correct answer, so that weak students can join in.','part',['anderson2001'],'Easy recall questions help some students start, but a lesson also needs questions that ask students to explain and evaluate.'],
  ['Studies prove that students who do not raise their hands have lower intelligence.','not',['dweck2006','macintyre1998'],'No such proof exists. Willingness to speak depends on confidence and situation, and ability is not fixed.'],
  ['Calling on random students without warning is the best method in every class.','not',['horwitz1986','kumar2001'],'Sudden calling can raise anxiety for some learners, and no method is best everywhere.']],
 sol:[['Wait about three seconds after each question.',['rowe1986']],['Use “think, pair, share” before whole-class answers.',['long1985']],['Mix recall questions with questions that ask “why” and “how”.',['anderson2001']]]},

{id:'t3',title:'Laughing at pronunciation',skill:'Pronunciation',level:'B1',
 ctx:'You teach a Grade 10 group at an academic lyceum in Bukhara. When students read aloud, classmates laugh at their accent, especially at the “th” and “w” sounds. Two students now refuse to read. A colleague advises you to spend the next month on drills until everyone sounds “like a British speaker”.',
 facts:[['Group','14 students, ages 16–17'],['Level','B1'],['Problem','Laughing at accents; 2 students refuse to read'],['Advice','A month of drills for a British accent']],
 q:['What is the main problem?',['Students cannot produce English sounds','Fear of being laughed at and an unrealistic goal of a native accent','The reading texts are too long'],1,'Laughing creates fear, and a “British accent” goal is not needed for being understood.'],
 ai:[['The goal of pronunciation teaching should be intelligibility, not a native-like accent.','sup',['derwing2005'],'Research shows an accent does not always reduce intelligibility; teaching should focus on what causes misunderstanding.'],
  ['A month of drills will give every student a perfect British accent.','not',['derwing2005'],'There is no evidence for such a fast change, and a native accent is not the right goal.'],
  ['Agree class rules: nobody laughs at mistakes, and everyone gets support.','sup',['horwitz1986','marzano2003'],'Fear of negative evaluation is a key part of language anxiety; clear class rules help manage behaviour.'],
  ['Focus first on sounds and stress patterns that really cause misunderstanding for Uzbek speakers.','sup',['derwing2005'],'Priority should go to features that affect intelligibility.'],
  ['Students who refuse to read should get a low mark so that they try harder.','not',['horwitz1986','dweck2006'],'Punishing anxious students can increase anxiety and does not build confidence.'],
  ['Short choral reading before individual reading can make students feel safer.','part',['krashen1982'],'Lowering anxiety helps, but choral reading alone does not teach the sounds that cause problems.']],
 sol:[['Set intelligibility as the goal and explain it to the class.',['derwing2005']],['Make a no-laughing rule and model respectful reactions.',['horwitz1986','marzano2003']],['Practise the few sounds that block understanding, in short regular steps.',['derwing2005']]]},

{id:'t4',title:'Uzbek in pair work',skill:'Speaking',level:'A2',
 ctx:'In a Grade 8 class in Andijan, you give a pair-work task: plan a weekend trip in English. Within one minute most pairs are talking in Uzbek. They finish quickly and write two English sentences. Your mentor says: “Pair work does not work with our students. Go back to the textbook exercises.”',
 facts:[['Class','26 students, ages 13–14'],['Level','A2'],['Task','Plan a weekend trip in pairs'],['Result','Most talk in Uzbek, write 2 sentences']],
 q:['What is the main problem?',['Pair work is not suitable for Uzbek students','The task gave no language support and no clear reason to use English','The students do not like trips'],1,'Without useful phrases, a clear outcome and a reason to use English, students fall back on the L1.'],
 ai:[['Pair work cannot work in Uzbek schools, so the teacher should use only textbook exercises.','not',['long1985','kumar2001'],'Pair work can increase learner talk; it needs to be adapted to the context, not dropped.'],
  ['Before the task, give useful phrases and a model dialogue, then let pairs prepare.','sup',['willis1996'],'A pre-task with useful language is part of the task-based framework.'],
  ['Add a clear outcome: each pair must present its plan to another pair in English.','sup',['willis1996','ellis2003'],'A task needs a clear outcome; a report phase gives a reason to use English.'],
  ['Using Uzbek at any moment of a lesson always harms learning, so it must be banned.','not',['cook2001'],'There is no strong evidence for a total ban; the L1 can be used deliberately.'],
  ['Allow a short planning time in Uzbek, then require the task and the report in English.','part',['cook2001','garcia2014'],'Planned L1 use can support thinking, but the teacher must still make sure students use English for the task.'],
  ['Students will speak English automatically if the teacher walks around and shouts “English only!”.','not',['dornyei2001'],'Pressure alone does not build motivation; support and a supportive atmosphere do.']],
 sol:[['Give a pre-task with key phrases and a short model.',['willis1996']],['Give a clear outcome and a report to another pair.',['ellis2003']],['Use the L1 only at planned moments.',['cook2001']]]},

{id:'t5',title:'Three languages in one group',skill:'Classroom language',level:'A2–B1',
 ctx:'You teach a Grade 6 group in Samarkand city. Some pupils speak Uzbek at home, some Tajik, and some study in Russian at other lessons. When you explain a new word in Uzbek, several pupils still do not understand. A colleague says the only fair way is to explain everything in English and never use any other language.',
 facts:[['Group','15 pupils, ages 11–12'],['Home languages','Uzbek, Tajik, Russian'],['Level','A2–B1'],['Issue','Explanations in one L1 do not reach everyone']],
 q:['What is the main problem?',['Some pupils are not intelligent','Explanations rely on one language that not every pupil shares','English is too hard for Grade 6'],1,'The group is multilingual, so one L1 does not reach everyone.'],
 ai:[['Multilingual pupils can use all their languages as a resource for understanding English.','sup',['garcia2014'],'Translanguaging research sees the whole repertoire as a resource for learning.'],
  ['Use pictures, gestures, examples and short English definitions before any translation.','sup',['harmer2015'],'Methodology handbooks recommend several ways to show meaning; translation is only one of them.'],
  ['Let pupils check meaning in pairs in a language they share, then return to English.','sup',['cook2001','garcia2014'],'Planned L1 use can check meaning efficiently while English stays the main language.'],
  ['Pupils who speak Tajik at home will always learn English more slowly.','not',['garcia2014'],'There is no basis for this claim; multilingual learners bring useful language experience.'],
  ['Never use any language except English; this is the only scientifically proven method.','not',['cook2001','kumar2001'],'A total ban has no strong evidence, and no single method is proven for every context.'],
  ['A bilingual word list (English–Uzbek–Russian) on the wall will solve the problem.','part',['nation2013'],'A list can help, but words are learned through many meetings in use, not only by seeing translations.']],
 sol:[['Show meaning with pictures, examples and simple English first.',['harmer2015']],['Let pupils check meaning in a shared language at planned moments.',['cook2001','garcia2014']],['Recycle new words many times in tasks.',['nation2013']]]},

{id:'t6',title:'Points for everything',skill:'Motivation',level:'A2',
 ctx:'In a Grade 5 class in Namangan, a new teacher gives stars for every answer and shows a leaderboard on the board. In the first week pupils are very active. By the third week, pupils ask “How many stars?” before every task, and the five pupils at the bottom of the leaderboard stop trying.',
 facts:[['Class','24 pupils, ages 10–11'],['System','Stars and a public leaderboard'],['Week 1','Very active'],['Week 3','Pupils work only for stars; bottom 5 give up']],
 q:['What is the main problem?',['The pupils are greedy','The reward system has become the main reason to work and discourages weaker pupils','Stars are too small'],1,'The rewards shifted attention from learning to points, and a public ranking hurts those at the bottom.'],
 ai:[['Expected tangible rewards for doing a task can lower intrinsic motivation over time.','sup',['deci1999'],'The meta-analysis found this effect for expected tangible rewards.'],
  ['Gamification always increases motivation, so the leaderboard should stay as it is.','not',['hamari2014'],'Effects of gamification depend on the context and users; it is not always positive.'],
  ['Replace the public ranking with feedback on progress and effort for each pupil.','sup',['hattie2007','dweck2006'],'Feedback on the task and on strategy and effort supports learning better than ranking.'],
  ['Give pupils some choice in tasks and celebrate class goals instead of individual ranks.','sup',['ryan2000','johnson1989'],'Choice supports autonomy; shared goals build positive interdependence.'],
  ['Pupils at the bottom of the leaderboard are simply less able and should get easier lessons forever.','not',['dweck2006','tomlinson2014'],'Ability is not fixed; differentiation means changing support, not lowering goals forever.'],
  ['Use stars only from time to time, as a surprise, not as a payment for every answer.','part',['deci1999'],'Unexpected rewards were less harmful in the research, but they do not solve the problem alone.']],
 sol:[['Remove the public leaderboard.',['hamari2014']],['Give feedback on progress, effort and strategy.',['hattie2007','dweck2006']],['Use class goals and some choice to build intrinsic motivation.',['ryan2000','johnson1989']]]},

{id:'t7',title:'The rehearsed open lesson',skill:'Lesson planning',level:'B1',
 ctx:'Next week a methodist from the district education department will observe your open lesson (ochiq dars) in Grade 9. Your mentor suggests that you rehearse the whole lesson twice with the class so that every pupil knows exactly what to say. “The inspector wants to see a perfect lesson,” she says.',
 facts:[['Event','Open lesson with an observer'],['Class','Grade 9, 22 pupils'],['Advice','Rehearse the lesson twice'],['Worry','A “perfect” show lesson']],
 q:['What is the main problem?',['The observer is too strict','A rehearsed show does not show or support real learning','The lesson topic is boring'],1,'If pupils repeat memorised answers, the lesson shows no real learning and teaches nothing new.'],
 ai:[['A rehearsed lesson is the best way to show the observer how well pupils learn.','not',['black1998'],'Rehearsed answers hide what pupils really know; real assessment uses information about actual learning.'],
  ['Plan real tasks where pupils use English, and show how you check and support their learning during the lesson.','sup',['black1998','richards2006'],'Formative assessment and communicative tasks make learning visible.'],
  ['After the lesson, reflect with the observer on what worked and what did not.','sup',['schon1983'],'Reflection on action helps teachers improve their decisions.'],
  ['Memorised dialogues have no value at all in language teaching.','not',['wood1976'],'Memorised dialogues can be a useful scaffold, but they should lead to free use of language.'],
  ['Observers in Uzbekistan always prefer rehearsed lessons.','not',['schon1983'],'This is an unsupported generalisation about all observers.'],
  ['A short rehearsal of the task instructions only (not the answers) can reduce confusion.','part',['sweller1988'],'Clear instructions reduce unnecessary load, but rehearsing answers would remove the real task.']],
 sol:[['Plan a real communicative task with an outcome.',['richards2006']],['Check learning during the lesson and adjust.',['black1998']],['Reflect on the lesson with the observer afterwards.',['schon1983']]]},

{id:'t8',title:'“No pair work, it gets noisy”',skill:'Classroom management',level:'A2',
 ctx:'You are a trainee in a Grade 7 class in Jizzakh. When you try pair work, the class becomes very noisy, some pupils play, and your mentor stops the activity. She tells you: “Our pupils are not ready for pair work. Keep them quiet and let them write exercises.”',
 facts:[['Class','30 pupils, ages 12–13'],['Activity','Pair dialogue'],['Result','Noise and off-task talk'],['Mentor','Wants quiet written work only']],
 q:['What is the main problem?',['Pupils cannot work in pairs','The activity had no clear procedures, time limit or signals for attention','The classroom is too small'],1,'Noise usually comes from unclear procedures, not from an inability to work in pairs.'],
 ai:[['Teach clear procedures: a signal for silence, a time limit and a task card for each pair.','sup',['marzano2003'],'Rules and procedures are a core part of effective classroom management.'],
  ['Pair work gives pupils much more speaking time than whole-class teaching.','sup',['long1985'],'Pair and group work increase the amount of learner talk.'],
  ['Quiet classes always learn more than noisy classes.','not',['long1985','swain1985'],'Productive talk is part of language learning; silence is not a sign of learning.'],
  ['Pupils of this age are not ready for pair work, so wait until Grade 10.','not',['long1985','kumar2001'],'There is no evidence for such an age limit; tasks should be adapted to the class.'],
  ['Start with very short, highly structured pair tasks (one minute) and make them longer later.','sup',['wood1976'],'Gradual reduction of structure is scaffolding.'],
  ['Give each pair a role (speaker, checker) so that both pupils are responsible.','part',['johnson1989'],'Roles support individual accountability, but they must be taught and monitored to work.']],
 sol:[['Teach procedures and an attention signal before pair work.',['marzano2003']],['Start with one-minute structured pair tasks.',['wood1976']],['Give roles and check each pair’s result.',['johnson1989']]]},

{id:'t9',title:'Thirty-two pupils, fixed desks',skill:'Speaking',level:'A1–A2',
 ctx:'You work in a village school in Kashkadarya region. Your Grade 6 class has 32 pupils sitting at fixed desks in rows. There is no projector. You want pupils to speak more, but you think that with so many pupils speaking activities are impossible.',
 facts:[['Class','32 pupils, ages 11–12'],['Room','Fixed desks in rows'],['Resources','No projector, one textbook'],['Level','A1–A2']],
 q:['What is the main problem?',['Speaking is impossible in large classes','The teacher needs speaking techniques that fit a large class with fixed desks','Pupils do not need speaking at this age'],1,'Large classes need adapted techniques, not giving up on speaking.'],
 ai:[['Pupils can work with the neighbour at the same desk; pair work does not need movement.','sup',['long1985','ur2012'],'Pair work increases talk and can be organised with desk partners in large classes.'],
  ['Speaking activities are only possible in classes of fewer than 15 pupils.','not',['ur2012','kumar2001'],'There is no such limit; practical techniques exist for large classes.'],
  ['Use short choral repetition first, then pairs, then a few pupils speak to the class.','sup',['wood1976'],'Moving from more support to less support is scaffolding.'],
  ['Without a projector, modern teaching is impossible.','not',['kumar2001'],'Teaching must fit local conditions; practicality matters more than equipment.'],
  ['Use simple picture cards drawn on the board for information-gap tasks.','sup',['richards2006'],'Information-gap activities are typical CLT tasks and need few resources.'],
  ['Large classes always have lower results, so the teacher should not worry about methods.','not',['kumar2001','ur2012'],'This is fatalistic and unsupported; methods still make a difference.']],
 sol:[['Use desk-partner pair work with short tasks.',['long1985','ur2012']],['Move from choral practice to pairs to individuals.',['wood1976']],['Use simple information-gap tasks with board drawings.',['richards2006']]]},

{id:'t10',title:'Rules known, rules unused',skill:'Grammar',level:'B1',
 ctx:'You teach a first-year group at a pedagogical institute in Termez. Students score well on gap-fill tests with the present perfect and can explain the rule in Uzbek. In conversation they almost always use the past simple instead: “I never was in London.” The mid-term test is mostly written gap-fill.',
 facts:[['Group','18 students, ages 18–19'],['Level','B1'],['Tests','Written gap-fill'],['Problem','Rule known but not used in speech']],
 q:['What is the main problem?',['Students do not know the rule','Students know the rule but have little practice using it for communication','The test is too easy'],1,'They can state the rule, so the gap is between knowing and using.'],
 ai:[['Once students understand the rule, they will use it correctly in speech automatically.','not',['spada2008','swain1985'],'Knowing a rule does not guarantee using it; learners need practice in meaningful use.'],
  ['Design speaking tasks that need the present perfect, such as a “Have you ever…?” class survey.','sup',['richards2006','spada2008'],'Integrated form-focused practice inside communicative tasks supports use.'],
  ['Explicit grammar teaching has no effect, so stop explaining rules completely.','not',['norris2000'],'The meta-analysis found explicit instruction effective.'],
  ['Give delayed feedback after the task: write common errors on the board and discuss them.','sup',['ellis2009'],'Delayed correction is an accepted option in fluency activities.'],
  ['Help students notice the form in short listening and reading texts before they speak.','sup',['schmidt1990'],'Noticing a form in input supports its learning.'],
  ['Make the test 100% oral so students will use the tense in speech.','part',['alderson1993'],'Tests influence teaching (washback), but the effect is not automatic, and written skills still matter.']],
 sol:[['Help students notice the form in real texts.',['schmidt1990']],['Practise it in communicative tasks.',['richards2006','spada2008']],['Give delayed, focused feedback.',['ellis2009']]]},

{id:'t11',title:'Correcting every mistake',skill:'Speaking',level:'B1',
 ctx:'At a private learning centre (o‘quv markazi) in Fergana, you observe a colleague’s speaking class. She stops students after every mistake and makes them repeat the correct form. By the end, students answer in one or two words. She says: “If I do not correct everything, the mistakes will become permanent.”',
 facts:[['Group','12 teenagers preparing for IELTS'],['Level','B1'],['Practice','Every error corrected at once'],['Result','Very short answers']],
 q:['What is the main problem?',['Students do not want IELTS','Constant interruption reduces fluency and confidence','The teacher speaks too little'],1,'Correcting every error at once stops the flow and raises anxiety.'],
 ai:[['If a teacher does not correct every error immediately, all errors become permanent.','not',['ellis2009'],'Research does not support correcting everything; teachers should choose which errors and when.'],
  ['In fluency activities, note errors and give feedback after the activity.','sup',['ellis2009'],'Delayed feedback is a recognised choice in fluency work.'],
  ['Use prompts that help students correct themselves, like “Again?” or “Past tense?”.','sup',['lyster1997'],'Elicitation and metalinguistic clues led to more learner uptake.'],
  ['Recasts are always the best type of feedback because they do not interrupt.','part',['lyster1997'],'Recasts were frequent but led to less uptake; they are not always best.'],
  ['Constant correction can raise anxiety and fear of negative evaluation.','sup',['horwitz1986'],'Fear of negative evaluation is a component of language anxiety.'],
  ['Exams punish every mistake, so the teacher must correct every mistake in class too.','not',['ellis2009','alderson1993'],'Classroom feedback should fit the learners and the activity; copying assumed exam conditions is not supported.']],
 sol:[['Separate accuracy and fluency activities.',['ellis2009']],['Use self-correction prompts on key errors.',['lyster1997']],['Give delayed feedback after fluency tasks.',['ellis2009']]]},

{id:'t12',title:'Red pen everywhere',skill:'Writing',level:'B1–B2',
 ctx:'You mark Grade 11 essays at a school in Navoi. You correct every error in red. Students receive pages full of red ink, look only at the mark, and make the same errors in the next essay. You spend four hours every weekend marking.',
 facts:[['Class','20 students, ages 16–17'],['Level','B1–B2'],['Feedback','Every error corrected'],['Effect','Same errors, 4 hours marking a week']],
 q:['What is the main problem?',['Students are careless','The feedback is too much and too unfocused for students to use','Essays are too long'],1,'Students cannot learn from feedback that covers everything at once.'],
 ai:[['Grammar correction in writing has been proven useless, so stop giving any feedback.','not',['ferris1999'],'The evidence is debated; selective feedback can help.'],
  ['Focus feedback on two or three error patterns and ask students to correct them in a second draft.','sup',['ferris1999','hyland2003'],'Selective feedback on patterns and revision through drafts support learning.'],
  ['Some researchers argue that grammar correction in writing does not improve accuracy.','sup',['truscott1996'],'This is Truscott’s position; it started a debate.'],
  ['Add comments about ideas and organisation, not only grammar.','sup',['hyland2003','hattie2007'],'Writing develops through attention to content and organisation; feedback should show next steps.'],
  ['Students should never see a mark, because marks always destroy motivation.','not',['black1998'],'Research shows feedback matters; it does not say that marks always destroy motivation.'],
  ['Use a short checklist so students check their own common errors before handing in.','part',['topping1998','jonsson2007'],'Self-checks with clear criteria can help, but students need training to use them well.']],
 sol:[['Give focused feedback on a few error patterns.',['ferris1999']],['Require a second draft.',['hyland2003']],['Show students where to go next.',['hattie2007']]]},

{id:'t13',title:'Grammar-translation for the entrance test',skill:'Methods',level:'B1',
 ctx:'At an academic lyceum in Urgench, an experienced teacher uses only grammar rules and translation of sentences into Uzbek. She says: “The university entrance test checks grammar, so speaking is a waste of time.” Students do well in grammar tests but cannot hold a short conversation.',
 facts:[['Group','Grade 11, 20 students'],['Method','Rules and translation only'],['Result','Good test scores, weak speaking'],['Belief','The test decides what to teach']],
 q:['What is the main problem?',['Students do not know grammar','Teaching is narrowed to what the test checks, so communicative skills are not developed','The test is too difficult'],1,'This is washback: the test narrows teaching.'],
 ai:[['Tests can influence what teachers teach, but the effect is not automatic and should be examined.','sup',['alderson1993'],'This is the main point of the washback article.'],
  ['Grammar-Translation is described in methodology books as a method focused on rules and translation, with little speaking.','sup',['larsen2011'],'This matches the description of the method.'],
  ['The goal of language teaching is communicative competence, so lessons should also include real communication.','sup',['richards2006'],'This is the central goal of CLT.'],
  ['Speaking practice will lower students’ grammar test scores.','not',['norris2000','spada2008'],'There is no evidence for this; form-focused work can be combined with communication.'],
  ['Grammar-Translation is the oldest method, so it is the most scientific.','not',['larsen2011'],'Age does not make a method scientific.'],
  ['Spend a small part of each lesson on short communicative tasks using the grammar of the day.','part',['spada2008','richards2006'],'Integrated practice is useful, but a small slot alone may not be enough for real speaking skills.']],
 sol:[['Keep grammar focus but integrate it into communicative tasks.',['spada2008']],['Discuss washback openly with colleagues.',['alderson1993']],['Plan for communicative competence, not only test scores.',['richards2006']]]},

{id:'t14',title:'Articles are a mystery',skill:'Grammar',level:'B1',
 ctx:'Your second-year university students in Samarkand often write “I bought book” or “The life is difficult”. Uzbek has no articles. A colleague says: “Articles cannot be learned by Uzbek speakers. Do not waste time on them.”',
 facts:[['Group','2nd-year students, 16 people'],['Level','B1'],['Errors','Missing or extra articles'],['L1','No articles in Uzbek']],
 q:['What is the main problem?',['Uzbek speakers cannot learn articles','A feature missing from the L1 needs explicit attention and noticing','The textbook has no articles'],1,'Features that do not exist in the L1 are hard but can be learned with focused attention.'],
 ai:[['Features missing from the first language are hard to notice, so the teacher should help learners notice them in texts.','sup',['schmidt1990'],'Noticing is needed for input to become intake.'],
  ['Explicit explanation of article use with many examples can help.','sup',['norris2000'],'Explicit instruction produced positive effects in the meta-analysis.'],
  ['Uzbek speakers can never learn articles, so ignore them.','not',['norris2000','dweck2006'],'There is no basis for this; instruction is effective and ability develops.'],
  ['Give focused written feedback on article errors in students’ texts.','sup',['ferris1999'],'Selective, consistent feedback on error patterns can help writers.'],
  ['One lesson on articles will solve the problem for all students.','not',['cepeda2006'],'Learning needs repeated practice spread over time.'],
  ['Ask students to underline every article in a short text and explain each one.','part',['schmidt1990'],'This supports noticing, but explaining every article may be too much for some students at once.']],
 sol:[['Help students notice articles in short texts.',['schmidt1990']],['Explain the main rules explicitly.',['norris2000']],['Return to articles regularly with focused feedback.',['cepeda2006','ferris1999']]]},

{id:'t15',title:'The English-only rule',skill:'Classroom language',level:'A1',
 ctx:'In a Grade 3 class in Karakalpakstan, your mentor insists on “English only” from the first minute. Pupils at A1 level often do not understand the instructions, copy their neighbours and become restless. Some pupils start crying when they do not understand.',
 facts:[['Class','Grade 3, 25 pupils'],['Level','A1'],['Rule','English only'],['Effect','Confusion and stress']],
 q:['What is the main problem?',['Pupils are too young for English','Instructions are not understood, which causes stress and wasted time','The lessons are too long'],1,'Young A1 learners need instructions they can understand.'],
 ai:[['A short, planned use of the first language for instructions can save time and reduce stress.','sup',['cook2001'],'Cook supports deliberate L1 use, for example to organise tasks.'],
  ['Show instructions with gestures, pictures and a demonstration before pupils start.','sup',['harmer2015'],'Demonstrating instructions is a standard technique.'],
  ['Young learners learn best through games and oral activities in the early grades.','sup',['pq1875'],'The 2012 resolution sets games and oral activities for early grades.'],
  ['Any use of the first language destroys the English lesson.','not',['cook2001'],'There is no strong evidence for this claim.'],
  ['Children feel no anxiety in language lessons, so stress is not important.','not',['krashen1982','horwitz1986'],'Anxiety affects language learning; children are not an exception.'],
  ['Teach a few classroom phrases (“Sit down”, “Work in pairs”) with actions so pupils learn them over time.','part',['nation2013'],'Repeated use helps learning, but it does not solve understanding of new instructions today.']],
 sol:[['Demonstrate every instruction.',['harmer2015']],['Use the L1 briefly when needed.',['cook2001']],['Build routines with games and oral activities.',['pq1875']]]},

{id:'t16',title:'Drill, drill, drill',skill:'Methods',level:'A2',
 ctx:'A teacher in Khorezm uses drills for the whole lesson: pupils repeat sentences after her, then substitute one word. Pupils are accurate in drills but cannot answer a simple real question like “What did you do yesterday?”. She believes that habits must be formed by repetition first.',
 facts:[['Class','Grade 7, 24 pupils'],['Method','Repetition and substitution drills'],['Result','Accurate drills, no free speech'],['Belief','Habits through repetition']],
 q:['What is the main problem?',['Pupils have bad memory','Practice stays at mechanical repetition and never reaches meaningful use','The sentences are too long'],1,'Drills alone do not move learners to using language for meaning.'],
 ai:[['Repetition drills come from the Audio-Lingual Method, which aims to form habits.','sup',['larsen2011'],'This matches the description of the Audio-Lingual Method.'],
  ['After short controlled practice, move to tasks where pupils use the language for real meaning.','sup',['richards2006','willis1996'],'CLT and task-based teaching emphasise meaningful use.'],
  ['Drills have no place in modern teaching at all.','not',['larsen2011','kumar2001'],'Techniques can be selected for a purpose; a short drill can be useful.'],
  ['Pupils need to produce their own sentences, not only repeat, to develop speaking.','sup',['swain1985'],'Producing language pushes learners to process it more deeply.'],
  ['The Audio-Lingual Method is the newest research-based method.','not',['larsen2011'],'It is an older method from the mid-20th century.'],
  ['Use drills only for pronunciation of new phrases, then switch to pair questions.','part',['larsen2011','long1985'],'This is a reasonable mix, but the choice depends on the lesson aim.']],
 sol:[['Keep drills short and purposeful.',['larsen2011']],['Move to meaningful pair questions and tasks.',['richards2006','long1985']],['Let pupils produce their own sentences.',['swain1985']]]},

{id:'t17',title:'Fifty words a week',skill:'Vocabulary',level:'B1',
 ctx:'At a school in Tashkent region, pupils in Grade 8 get a list of 50 English words with Uzbek translations every Monday and a test every Friday. They score well on Friday but forget most words within a month.',
 facts:[['Class','Grade 8, 27 pupils'],['Practice','50 words + translations weekly'],['Test','Every Friday'],['Problem','Words forgotten in a month']],
 q:['What is the main problem?',['Pupils have weak memory','Words are crammed for one test and not met again in use','The lists are too short'],1,'Cramming for a single test without recycling leads to forgetting.'],
 ai:[['Spreading practice over several weeks leads to better long-term memory than cramming.','sup',['cepeda2006'],'This is the spacing effect.'],
  ['Short recall quizzes on old words help memory more than rereading the list.','sup',['roediger2006'],'This is the testing (retrieval practice) effect.'],
  ['Words are learned through many meetings in different contexts, not from one list.','sup',['nation2013'],'Nation stresses repeated encounters in the four strands.'],
  ['The more words per week, the faster pupils’ vocabulary grows, so increase the list to 100.','not',['sweller1988','nation2013'],'Too much new information at once overloads memory; quantity is not the key.'],
  ['Pupils remember words better when they must use them in their own sentences.','sup',['laufer2001'],'Tasks with need, search and evaluation increase involvement.'],
  ['Translation lists are always harmful and must be removed.','part',['nation2013'],'Translations can help to learn meaning quickly, but they are not enough alone.']],
 sol:[['Reduce new words and recycle old ones every week.',['cepeda2006','nation2013']],['Use short retrieval quizzes.',['roediger2006']],['Ask pupils to use words in their own sentences.',['laufer2001']]]},

{id:'t18',title:'Translating every word',skill:'Reading',level:'A2–B1',
 ctx:'Grade 10 students in Kokand read texts slowly with a dictionary, translating every word into Uzbek. They read one short text per week and say that reading in English is boring and difficult.',
 facts:[['Class','Grade 10, 22 students'],['Habit','Word-by-word translation'],['Amount','1 short text a week'],['Attitude','Reading is boring']],
 q:['What is the main problem?',['Students are bad readers in Uzbek too','Students read too little, too slowly, and only difficult texts','There are no dictionaries'],1,'Word-by-word reading of hard texts gives little practice and kills interest.'],
 ai:[['Let students read a lot of easy, interesting books that they choose themselves.','sup',['day1998'],'This is extensive reading.'],
  ['Reading easy texts in quantity builds fluency, vocabulary and positive attitudes.','sup',['day1998','nation2013'],'Extensive reading and fluency development are supported in these works.'],
  ['Students must understand every word, otherwise they learn nothing from reading.','not',['day1998'],'Reading for general understanding is useful; not every word must be known.'],
  ['Teach students to guess meaning from context before using a dictionary.','part',['nation2013'],'Guessing from context is a useful strategy, but it works only when most words in the text are known.'],
  ['Reading in English is only possible after reaching C1.','not',['day1998','coe2001'],'Learners can read texts matched to their level at every CEFR level.'],
  ['Use graded readers matched to the students’ level.','sup',['day1998'],'Graded readers are the main material of extensive reading.']],
 sol:[['Start an extensive reading programme with graded readers.',['day1998']],['Let students choose what to read.',['day1998','ryan2000']],['Teach guessing from context when most words are known.',['nation2013']]]},

{id:'t19',title:'Listening means testing',skill:'Listening',level:'B1',
 ctx:'In your Grade 9 lessons, a listening task always follows the same steps: play the recording once, students answer ten questions, you check the answers. Students who get low scores say: “I cannot understand anything when they speak fast.” Nobody knows why they fail.',
 facts:[['Class','Grade 9, 24 students'],['Routine','Play, answer, check'],['Complaint','Speech is too fast'],['Missing','Any work on how to listen']],
 q:['What is the main problem?',['The recordings are too fast for Grade 9','Listening is only tested, never taught','Students do not try'],1,'The routine checks answers but does not teach the listening process.'],
 ai:[['Many lessons only test listening with comprehension questions instead of teaching it.','sup',['field2008'],'This is Field’s central criticism of the comprehension approach.'],
  ['Teach strategies: predicting before listening, checking with a partner, and reflecting on what was difficult.','sup',['vandergrift2012'],'This is a metacognitive approach to listening.'],
  ['Play the recording again and look at short parts where students failed, to recognise words in fast speech.','sup',['field2008'],'Working on the parts that caused problems teaches the process.'],
  ['Students who cannot understand fast speech should only listen to slow recordings until C1.','not',['field2008','coe2001'],'Learners need gradual exposure to natural speech at their level, not avoidance.'],
  ['Listening ability cannot be improved; it is a natural talent.','not',['vandergrift2012'],'Instruction in listening processes improves listening.'],
  ['Let students read the transcript after the second listening.','part',['field2008'],'Transcripts can help notice words in connected speech, but they should not replace listening practice.']],
 sol:[['Add pre-listening prediction.',['vandergrift2012']],['Work on difficult short parts of the recording.',['field2008']],['Let students reflect on their listening problems.',['vandergrift2012']]]},

{id:'t20',title:'Panic in the listening exam',skill:'Listening',level:'B1–B2',
 ctx:'At a learning centre in Samarkand, students preparing for the Multilevel exam panic in the listening part. When they miss one answer, they lose the next three answers too. Your colleague says: “Just do more practice tests every day.”',
 facts:[['Group','10 students, ages 17–20'],['Exam','Multilevel (CEFR)'],['Problem','One missed answer → several missed'],['Advice','Daily practice tests only']],
 q:['What is the main problem?',['Students need more vocabulary only','Students lack strategies to monitor and recover during listening, and anxiety rises','The exam is unfair'],1,'Without monitoring strategies and with anxiety, one miss causes a chain of misses.'],
 ai:[['Teach students to plan, monitor and evaluate their listening, for example to move on when they miss an answer.','sup',['vandergrift2012'],'Metacognitive instruction targets exactly these skills.'],
  ['Test anxiety is part of foreign language anxiety and can affect performance.','sup',['horwitz1986'],'Test anxiety is one of the three components described.'],
  ['Doing a full practice test every day is the only way to improve listening.','not',['field2008','vandergrift2012'],'Tests alone do not teach listening processes.'],
  ['After each practice test, students should discuss why they missed answers.','sup',['vandergrift2012','black1998'],'Reflection and using results to improve are part of metacognition and formative assessment.'],
  ['Learning centres that do more tests always get higher exam results.','not',['alderson1993'],'Washback is complex; more tests do not automatically mean better results.'],
  ['Practise with exam-format tasks some of the time, so students are familiar with the format.','part',['brown2010'],'Familiarity can reduce surprise, but it should not replace teaching.']],
 sol:[['Teach “move on” and monitoring strategies.',['vandergrift2012']],['Discuss reasons for missed answers after practice.',['black1998']],['Address test anxiety openly.',['horwitz1986']]]},

{id:'t21',title:'One draft and done',skill:'Writing',level:'B1',
 ctx:'Your first-year students at a university in Andijan write an essay in class, hand it in and never see it again except for a mark. Their next essays have the same weak structure. They say they do not know how to make an essay better.',
 facts:[['Group','20 students'],['Level','B1'],['Practice','One draft, then a mark'],['Problem','No improvement between essays']],
 q:['What is the main problem?',['Students are lazy writers','There is no planning, feedback or revision cycle','Essays are too short'],1,'Without drafts and feedback, students get no chance to improve a text.'],
 ai:[['Writing improves through planning, drafting, feedback and revising.','sup',['hyland2003'],'This is the process approach to writing.'],
  ['Show model essays and analyse how they are organised for the reader.','sup',['hyland2003'],'This is part of the genre approach.'],
  ['Ask students to give feedback to each other with a simple checklist before the teacher reads the draft.','sup',['topping1998'],'Peer assessment can help when criteria are clear and students are trained.'],
  ['Good writers are born; teaching cannot improve essay structure.','not',['dweck2006','hyland2003'],'Writing skills develop with instruction and practice.'],
  ['Feedback should show the student where to go next, not only a mark.','sup',['hattie2007'],'“Where to next?” is one of the three feedback questions.'],
  ['Requiring three drafts of every essay is always necessary.','part',['hyland2003'],'Drafting is useful, but the number of drafts should fit the time and the task.']],
 sol:[['Introduce planning and at least one revised draft.',['hyland2003']],['Use model texts to show structure.',['hyland2003']],['Add peer feedback with a checklist.',['topping1998']]]},

{id:'t22',title:'Memorised IELTS templates',skill:'Writing',level:'B2',
 ctx:'Students at a learning centre in Tashkent memorise ready-made IELTS Writing Task 2 essays and “universal” introduction templates from a Telegram channel. In the exam, their essays do not answer the actual question, and they receive lower scores than expected.',
 facts:[['Group','15 students, ages 17–22'],['Habit','Memorised templates'],['Source','Telegram channel'],['Result','Off-topic essays']],
 q:['What is the main problem?',['IELTS is too hard','Memorised texts replace real writing for the question asked','Telegram is banned'],1,'Templates do not answer the specific task, so the writing is off-topic.'],
 ai:[['Teach how argument essays are organised and how to answer the exact question, instead of memorising whole texts.','sup',['hyland2003'],'Genre-based teaching shows how texts work for their purpose.'],
  ['Universal templates guarantee a band 7 in any IELTS essay.','not',['brown2010','wineburg2019'],'There is no evidence for such a guarantee; claims from unknown channels should be checked.'],
  ['Check the reliability of a Telegram channel by looking at what other sources say about it.','sup',['wineburg2019'],'This is lateral reading.'],
  ['Exams can push teaching towards test tricks, but this effect should be examined, not assumed good.','sup',['alderson1993'],'This is the washback idea.'],
  ['Learning a few useful linking phrases can help, if students use them to answer the question.','part',['hyland2003','nation2013'],'Useful phrases support writing, but they cannot replace ideas that answer the task.'],
  ['Memorising model essays is the most effective way to learn to write.','not',['hyland2003','swain1985'],'Writing develops through producing and revising one’s own texts.']],
 sol:[['Teach the structure of argument essays.',['hyland2003']],['Practise analysing the exact question.',['hyland2003']],['Check online “guaranteed” methods with lateral reading.',['wineburg2019']]]},

{id:'t23',title:'Only the teacher can judge',skill:'Writing',level:'B1–B2',
 ctx:'You want your third-year students in Bukhara to give each other feedback on their essay drafts. They refuse: “Only the teacher can judge. Our classmates make mistakes too.” The first attempt was a disaster: students wrote only “Good!” on each other’s papers.',
 facts:[['Group','16 students'],['Task','Peer feedback on drafts'],['Attitude','Only the teacher can judge'],['First try','“Good!” only']],
 q:['What is the main problem?',['Peer feedback never works','Students had no training and no clear criteria for peer feedback','The essays were too long'],1,'Peer feedback needs training and criteria.'],
 ai:[['Peer assessment can be useful when students are trained and criteria are clear.','sup',['topping1998'],'This is the main conclusion of Topping’s review.'],
  ['Give students a short rubric with 3–4 criteria and an example of useful comments.','sup',['jonsson2007','topping1998'],'Clear criteria and examples improve reliability and usefulness.'],
  ['Peer feedback should completely replace the teacher’s feedback.','not',['topping1998'],'The teacher still monitors and supports the process.'],
  ['Students who are not experts cannot give any useful feedback.','not',['topping1998'],'Trained peers can give useful feedback.'],
  ['Explain why peer feedback helps the reviewer too: they learn to see problems in their own writing.','part',['topping1998','hyland2003'],'This benefit is often reported, but students still need to see it in practice.'],
  ['Model good feedback in class first, using an anonymous sample essay.','sup',['wood1976'],'Modelling and then reducing support is scaffolding.']],
 sol:[['Train students with a model and a sample essay.',['wood1976']],['Use a short rubric.',['jonsson2007']],['Keep teacher monitoring and final feedback.',['topping1998']]]},

{id:'t24',title:'The “th” obsession',skill:'Pronunciation',level:'B1',
 ctx:'A teacher at a lyceum in Samarkand spends most pronunciation time on the “th” sound. Meanwhile, students often put the stress on the wrong syllable, for example “DEvelop” instead of “deVElop” and “PHOtographer” instead of “phoTOgrapher”, and listeners often do not understand them in role-plays.',
 facts:[['Group','Grade 10, 18 students'],['Focus','The “th” sound'],['Bigger issue','Word stress errors'],['Effect','Misunderstanding in role-plays']],
 q:['What is the main problem?',['Students cannot hear sounds','Teaching time goes to a feature that matters less for understanding than word stress','Role-plays are too hard'],1,'Priority should go to what causes misunderstanding.'],
 ai:[['Pronunciation teaching should give priority to features that most affect intelligibility.','sup',['derwing2005'],'This is the main recommendation of the article.'],
  ['Wrong word stress can make words hard to recognise for listeners.','part',['derwing2005'],'Prosodic features such as stress can affect understanding, but the effect depends on the word and the listener.'],
  ['The “th” sound is the most important sound in English.','not',['derwing2005'],'There is no basis for this ranking; it depends on intelligibility.'],
  ['A native-like accent is necessary to be understood.','not',['derwing2005'],'An accent does not necessarily reduce intelligibility.'],
  ['Mark stress in new words and practise them in short phrases.','sup',['harmer2015'],'Marking and practising stress is a standard technique.'],
  ['Record role-plays and let students find which words listeners misunderstood.','sup',['derwing2005','schmidt1990'],'Students notice the features that cause problems.']],
 sol:[['Prioritise word stress and features that block understanding.',['derwing2005']],['Mark stress on new words.',['harmer2015']],['Let students notice problems in recordings.',['schmidt1990']]]},

{id:'t25',title:'Reading aloud round the class',skill:'Reading',level:'A2',
 ctx:'In a Grade 6 class in Jizzakh, every reading lesson the teacher asks pupils to read the text aloud one by one around the class. Weak readers become nervous long before their turn, and others do not follow the text. After the reading, pupils cannot say what the text was about.',
 facts:[['Class','Grade 6, 26 pupils'],['Routine','Reading aloud in turns'],['Effect','Nervous pupils, no understanding'],['Level','A2']],
 q:['What is the main problem?',['The text is boring','Reading aloud in turns raises anxiety and does not develop understanding','The pupils have poor eyesight'],1,'Round-robin reading focuses on performance, not comprehension.'],
 ai:[['Pupils should first read silently with a clear question, then discuss the answer.','sup',['harmer2015'],'Giving a reading purpose and silent reading are standard techniques.'],
  ['Waiting for one’s turn to read in front of the class can cause anxiety.','sup',['horwitz1986'],'Fear of negative evaluation is a source of language anxiety.'],
  ['Reading aloud is the best way to check reading comprehension.','not',['brown2010'],'Reading aloud mostly shows pronunciation, not understanding; the check would not be valid for comprehension.'],
  ['Reading aloud should never be used in any lesson.','not',['harmer2015'],'It can have a role, for example rehearsed reading for pronunciation.'],
  ['Pupils who read slowly are less intelligent.','not',['dweck2006'],'Reading speed develops with practice; it is not fixed intelligence.'],
  ['Let pupils practise reading a short part in pairs before anyone reads to the class.','part',['long1985','krashen1982'],'Pair rehearsal lowers risk, but it still does not teach comprehension by itself.']],
 sol:[['Give a reading question and read silently first.',['harmer2015']],['Check understanding with tasks, not reading aloud.',['brown2010']],['Use rehearsed pair reading only for pronunciation.',['long1985']]]}
);
/* TASKS 26–50: assessment, feedback, motivation and classroom management. */
TASKS.push(
{id:'t26',title:'Teaching only for the test',skill:'Assessment',level:'B1',
 ctx:'At a school in Fergana, the head teacher wants high results in the national Multilevel exam. In Grade 11 the English teacher now teaches only exam task types: every lesson is a practice test. Students know the format well, but when a foreign guest visits, nobody can talk with her.',
 facts:[['Class','Grade 11, 25 students'],['Lessons','Practice tests every lesson'],['Pressure','Exam results'],['Result','Cannot talk with a guest']],
 q:['What is the main problem?',['The guest spoke too fast','Teaching has narrowed to test practice instead of language development','The exam is not important'],1,'Test practice replaced learning to communicate.'],
 ai:[['Tests can influence teaching, and this influence can be negative when lessons become only test practice.','sup',['alderson1993'],'This is washback; the article shows it must be examined.'],
  ['The best preparation for any exam is to do practice tests every lesson.','not',['field2008','black1998'],'Practice tests check skills but do not teach them; formative teaching improves learning.'],
  ['Teach the skills behind the exam (reading, listening, speaking, writing) through real tasks, and practise the format only sometimes.','sup',['richards2006','brown2010'],'Communicative teaching builds skills; familiarity with the format is a smaller part.'],
  ['The CEFR is itself an exam with fixed task types.','not',['coe2001'],'The CEFR is a reference framework with level descriptors, not a test.'],
  ['Students who know the exam format will always get a high level.','not',['brown2010'],'A valid test measures ability, not only familiarity with the format.'],
  ['Use exam tasks as material for discussion and learning, not only for scoring.','part',['black1998'],'Using results to guide teaching is formative, but exam tasks are a narrow base for a whole course.']],
 sol:[['Build skills through real communicative tasks.',['richards2006']],['Use test practice sparingly and formatively.',['black1998']],['Explain to the school what washback means.',['alderson1993']]]},

{id:'t27',title:'Two teachers, two marks',skill:'Assessment',level:'B1–B2',
 ctx:'At an institute in Samarkand, two teachers marked the same student’s oral exam. One gave 4 out of 5, the other 2 out of 5. Students complain that marks depend on the teacher, not on their English. There is no written scale; teachers mark “by experience”.',
 facts:[['Exam','Oral test, 1st-year students'],['Problem','Very different marks'],['Practice','Marking by experience'],['Students','Feel it is unfair']],
 q:['What is the main problem?',['One teacher is too strict','There are no shared criteria, so scoring is unreliable','The exam was too short'],1,'Without a shared rubric, marks vary between raters.'],
 ai:[['Analytic rubrics with clear criteria and examples make scoring more reliable.','sup',['jonsson2007'],'This is the main finding of the review.'],
  ['Train teachers together on sample recordings before the exam.','sup',['jonsson2007'],'Rater training improves agreement.'],
  ['Experienced teachers never need criteria; their intuition is always accurate.','not',['jonsson2007','brown2010'],'Reliability needs shared criteria and training.'],
  ['Base the rubric on CEFR descriptors for speaking, adapted to the course.','sup',['coe2001','coe2020'],'CEFR descriptors are designed as a reference for assessment.'],
  ['Give students the rubric before the exam so they know the expectations.','part',['jonsson2007'],'Sharing rubrics can support learning, but students need to understand them, not just receive them.'],
  ['The fairest way is to give all students the same mark.','not',['brown2010'],'That would not be a valid measure of ability.']],
 sol:[['Write a short analytic rubric.',['jonsson2007']],['Adapt criteria from CEFR descriptors.',['coe2001']],['Train raters on samples.',['jonsson2007']]]},

{id:'t28',title:'Only the mark matters',skill:'Feedback',level:'B1',
 ctx:'You write detailed comments on Grade 10 tests, but students look only at the mark and throw the paper away. Parents in the class Telegram group also ask only about marks. You wonder whether comments are worth the time.',
 facts:[['Class','Grade 10, 23 students'],['Your feedback','Detailed comments'],['Students','Look only at the mark'],['Parents','Ask only about marks']],
 q:['What is the main problem?',['Comments are useless','Feedback is not used, because students have no task or reason to act on it','Marks are too low'],1,'Feedback helps only when learners use it.'],
 ai:[['Feedback should tell students where they are going, how they are going and what to do next.','sup',['hattie2007'],'These are the three feedback questions.'],
  ['Using assessment information to improve learning (formative assessment) can raise achievement.','sup',['black1998'],'This is the main conclusion of the review.'],
  ['Give students 10 minutes in class to correct one thing using your comments.','sup',['black1998','hattie2007'],'Acting on feedback makes it formative.'],
  ['Written comments never help students, so give only marks.','not',['hattie2007','black1998'],'Research shows feedback can be powerful when it is used.'],
  ['Write the comment first and give the mark one lesson later.','part',['black1998'],'This can focus attention on comments, but it needs to be explained to students and parents.'],
  ['Praise like “Clever girl!” is the most effective feedback.','not',['hattie2007','dweck2006'],'Praise about the person has little effect on learning.']],
 sol:[['Make feedback answer “What next?”.',['hattie2007']],['Give class time to act on comments.',['black1998']],['Explain formative feedback to parents.',['black1998']]]},

{id:'t29',title:'One test at the end of term',skill:'Assessment',level:'A2–B1',
 ctx:'In a Grade 8 class in Surkhandarya, the only assessment is a written test at the end of each term. Many pupils fail, and the teacher learns about their problems when it is too late to help.',
 facts:[['Class','Grade 8, 29 pupils'],['Assessment','One test per term'],['Result','Many fail'],['Problem','Problems found too late']],
 q:['What is the main problem?',['The test is too hard','There is no ongoing assessment to find problems early','Pupils do not study at home'],1,'Without formative checks, problems are found only at the end.'],
 ai:[['Short regular checks during the term help the teacher see problems early and adjust teaching.','sup',['black1998'],'This is formative assessment.'],
  ['Low-stakes quizzes also help memory.','sup',['roediger2006'],'Retrieval practice improves long-term retention.'],
  ['More tests always mean more stress and lower results.','not',['roediger2006','black1998'],'Low-stakes checks support learning; the effect depends on how they are used.'],
  ['Use exit tickets: pupils write one thing they learned and one question at the end of the lesson.','sup',['black1998'],'This is a simple formative technique.'],
  ['The end-of-term test should be removed completely.','not',['brown2010'],'Summative tests have a role; the problem is the lack of formative assessment.'],
  ['Give a mark for every small quiz to make pupils take it seriously.','part',['black1998','deci1999'],'Marks can raise attention, but making every check high-stakes can shift focus from learning to marks.']],
 sol:[['Add short low-stakes checks every week.',['black1998','roediger2006']],['Use exit tickets to adjust teaching.',['black1998']],['Keep the term test as one part of assessment.',['brown2010']]]},

{id:'t30',title:'Can-do or cannot',skill:'Assessment',level:'A2–B1',
 ctx:'You want Grade 9 pupils to assess their own progress. A colleague says: “Pupils cannot judge themselves. They will all say they are excellent.” You have heard about CEFR “can-do” statements.',
 facts:[['Class','Grade 9, 20 pupils'],['Idea','Self-assessment'],['Concern','Pupils overrate themselves'],['Tool','CEFR can-do statements']],
 q:['What is the main problem?',['Pupils are dishonest','Self-assessment needs clear descriptors and practice to be useful','Self-assessment is not allowed'],1,'Concrete descriptors make self-assessment more meaningful.'],
 ai:[['CEFR can-do descriptors describe what learners can do at each level and can support self-assessment.','sup',['coe2001'],'The CEFR uses can-do descriptors for planning and assessment.'],
  ['Pupils can never judge their own learning.','not',['black1998','topping1998'],'Self- and peer assessment can work with clear criteria and training.'],
  ['Turn the descriptors into simple statements, for example “I can ask and answer about my free time.”','sup',['coe2001'],'Adapting descriptors to learners is in line with the framework.'],
  ['Compare self-assessment with a short task, so pupils can check their judgment.','sup',['black1998'],'Evidence from tasks makes assessment formative.'],
  ['Self-assessment results can replace the teacher’s marks.','not',['brown2010'],'Self-assessment supports learning; it is not a reliable replacement for formal marks.'],
  ['Pupils will rate themselves more honestly if the self-assessment has no effect on their mark.','part',['black1998'],'Low stakes can help honesty, but pupils still need practice with descriptors.']],
 sol:[['Use simple can-do statements from the CEFR.',['coe2001']],['Link self-assessment to evidence from tasks.',['black1998']],['Keep it low-stakes and practise it.',['topping1998']]]},

{id:'t31',title:'“You are so clever!”',skill:'Feedback',level:'A2',
 ctx:'A teacher in Grade 4 often says “You are so clever!” to pupils who answer correctly and says nothing to those who make mistakes. After a while, some pupils avoid difficult tasks: “I am not clever, I cannot do it.”',
 facts:[['Class','Grade 4, 22 pupils'],['Praise','“You are so clever!”'],['Effect','Pupils avoid hard tasks'],['Others','No feedback after mistakes']],
 q:['What is the main problem?',['Pupils are lazy','Praise about intelligence encourages a fixed view of ability','The tasks are too easy'],1,'Praising “cleverness” can make pupils fear failure.'],
 ai:[['Praise for effort and strategy supports a growth mindset better than praise for intelligence.','sup',['dweck2006'],'This is a central point of Dweck’s work.'],
  ['Feedback about the person (“clever”) has little effect on learning compared with feedback about the task and process.','sup',['hattie2007'],'Self-level praise is the least effective level.'],
  ['Children with a fixed mindset can never change it.','not',['dweck2006'],'Mindsets can change.'],
  ['Give specific feedback after mistakes too: what to try next.','sup',['hattie2007'],'“Where to next?” supports progress.'],
  ['Never praise children; praise is always harmful.','not',['hattie2007','dweck2006'],'The kind of praise matters, not praise as such.'],
  ['Show pupils examples of how mistakes help learning.','part',['dweck2006'],'This fits a growth mindset, but it works only if the class atmosphere really accepts mistakes.']],
 sol:[['Praise effort and strategies.',['dweck2006']],['Give task and process feedback.',['hattie2007']],['Treat mistakes as normal steps in learning.',['dweck2006']]]},

{id:'t32',title:'Quizzes every lesson',skill:'Learning',level:'B1',
 ctx:'You start each Grade 10 lesson with a five-minute quiz on old material. Some students complain: “We already studied this. Why do you test us again? It is a waste of time.” Your mentor is also unsure.',
 facts:[['Class','Grade 10, 24 students'],['Practice','5-minute quiz on old material'],['Complaint','Waste of time'],['Marks','Quizzes are not graded']],
 q:['What is the main problem?',['Quizzes harm students','Students and the mentor do not know why recall practice helps','The quiz is too long'],1,'The practice is useful; its purpose needs explaining.'],
 ai:[['Recalling information in short quizzes improves long-term memory more than rereading.','sup',['roediger2006'],'This is the testing effect.'],
  ['Returning to old material over several weeks helps more than studying it once.','sup',['cepeda2006'],'This is the spacing effect.'],
  ['Quizzes should always be graded, otherwise they do not work.','not',['roediger2006'],'The benefit comes from recall, not from the grade.'],
  ['Explain the research to students and show them their own progress.','part',['roediger2006','ryan2000'],'Understanding the purpose can increase motivation, but explanation alone may not convince everyone.'],
  ['Quizzes are useful only for weak students.','not',['roediger2006'],'Retrieval practice helps learners in general.'],
  ['Use the quiz results to decide what to review.','sup',['black1998'],'Using results to adjust teaching is formative assessment.']],
 sol:[['Keep short ungraded recall quizzes.',['roediger2006']],['Space review over weeks.',['cepeda2006']],['Use results to plan review.',['black1998']]]},

{id:'t33',title:'Three hours of homework',skill:'Homework',level:'A2',
 ctx:'Parents of Grade 5 pupils in Tashkent complain that their children do English homework for three hours a night. The teacher believes that more homework always means better results.',
 facts:[['Class','Grade 5'],['Homework','About 3 hours a night'],['Parents','Complain'],['Belief','More homework is better']],
 q:['What is the main problem?',['Parents are too soft','The homework amount is too large and its value at this age is limited','The pupils are slow'],1,'Too much homework for young pupils has limited benefit.'],
 ai:[['The link between homework and achievement is weaker in primary school than in secondary school.','sup',['cooper2006'],'This is one of the review’s findings.'],
  ['More homework always means better results.','not',['cooper2006'],'The review does not support “the more the better”.'],
  ['Give short homework that practises what was learned in class.','sup',['cooper2006','cepeda2006'],'Short practice spread over time supports learning.'],
  ['Homework should be removed in every grade.','not',['cooper2006'],'Homework has benefits, especially in secondary school.'],
  ['Ask parents how long homework really takes and adjust it.','part',['black1998'],'Information from families helps adjust teaching, but parent reports may vary.'],
  ['Young children learn best through playful oral activities, not long written tasks.','sup',['pq1875'],'The resolution stresses games and oral activities in the early grades.']],
 sol:[['Cut homework to short practice tasks.',['cooper2006']],['Make young pupils’ practice playful and oral.',['pq1875']],['Check homework time with parents.',['black1998']]]},

{id:'t34',title:'The Olympiad pair',skill:'Mixed ability',level:'A2–B2',
 ctx:'In a Grade 9 class in Namangan, two pupils prepare for the regional English Olympiad. The teacher spends most of the lesson with them, while the rest of the class copies exercises. Weaker pupils have stopped asking questions.',
 facts:[['Class','Grade 9, 27 pupils'],['Levels','A2 to B2'],['Focus','2 Olympiad pupils'],['Others','Copying exercises']],
 q:['What is the main problem?',['Olympiad pupils are too strong','Teaching serves only two pupils, not the whole mixed-level class','The textbook is too easy'],1,'The class needs differentiated teaching for everyone.'],
 ai:[['Teachers can differentiate content, process and product for different levels with the same goals.','sup',['tomlinson2014'],'This is the definition of differentiation.'],
  ['Give open-ended tasks that strong and weak pupils can do at their own level.','sup',['ur2012'],'Open-ended tasks are a technique for mixed-level classes.'],
  ['Strong pupils can explain to weaker ones in groups, which helps both.','part',['vygotsky1978','johnson1989'],'Help from a more capable peer supports learning, but it should not turn strong pupils into unpaid teachers.'],
  ['Weak pupils will catch up on their own by copying exercises.','not',['vygotsky1978','swain1985'],'Learning needs support in the ZPD and production, not copying.'],
  ['Olympiad pupils should prepare outside class with extra tasks and short check-ins.','sup',['tomlinson2014'],'Differentiated extension work is part of differentiation.'],
  ['Only talented pupils can reach B2, so the others do not need attention.','not',['dweck2006'],'Ability develops; all pupils need attention.']],
 sol:[['Plan open-ended tasks for all levels.',['ur2012','tomlinson2014']],['Give extension work to Olympiad pupils.',['tomlinson2014']],['Use structured peer help.',['vygotsky1978','johnson1989']]]},

{id:'t35',title:'A1 and B2 in one room',skill:'Mixed ability',level:'A1–B2',
 ctx:'Your first-year non-language students at a university in Karshi have very different levels: some are A1, some are B2 after private courses. The B2 students are bored and use their phones; the A1 students are lost and silent.',
 facts:[['Group','24 students, non-language faculty'],['Levels','A1 to B2'],['Strong','Bored, on phones'],['Weak','Lost and silent']],
 q:['What is the main problem?',['The strong students are rude','One task for everyone fits nobody in a very mixed group','There is not enough time'],1,'Very mixed levels need differentiated tasks.'],
 ai:[['Give the same core task with different levels of support or challenge.','sup',['tomlinson2014','ur2012'],'This is differentiation by process.'],
  ['Strong learners can take roles such as group leader or editor.','part',['johnson1989'],'Roles can engage strong learners, but each member still needs individual accountability.'],
  ['Learners learn best in their zone of proximal development: not too easy, not too hard.','sup',['vygotsky1978'],'This is the ZPD idea.'],
  ['Split the group permanently into “clever” and “weak” students.','not',['dweck2006','tomlinson2014'],'Fixed labels harm motivation; differentiation is flexible.'],
  ['Teach everyone at the A1 level so nobody is lost.','not',['vygotsky1978'],'Strong students would not learn anything new.'],
  ['Use a quick placement check to know the real levels.','sup',['black1998','coe2001'],'Knowing learners’ levels allows the teacher to adjust teaching.']],
 sol:[['Check levels at the start.',['coe2001']],['Use one task with different support levels.',['tomlinson2014']],['Keep groups flexible.',['tomlinson2014']]]},

{id:'t36',title:'Visual, auditory, kinesthetic',skill:'Learning',level:'—',
 ctx:'At a teachers’ seminar in Samarkand, a trainer asks every teacher to test pupils’ “learning styles” and to teach visual learners with pictures and auditory learners with audio only. She says it is “proven by science”.',
 facts:[['Event','Teachers’ seminar'],['Claim','Match teaching to learning styles'],['Source','Trainer says it is proven'],['Request','Test every pupil']],
 q:['What is the main problem?',['Pictures are useless','A popular idea is presented as proven without evidence','Pupils do not like tests'],1,'The claim needs evidence, and reviews do not support it.'],
 ai:[['There is no adequate evidence that matching teaching to learning styles improves learning.','sup',['pashler2008'],'This is the conclusion of the review.'],
  ['All pupils can benefit from pictures, audio and practice, chosen for the content.','sup',['pashler2008','harmer2015'],'Methods should fit the content, not labels.'],
  ['Teaching visual learners only with pictures is proven by neuroscience.','not',['pashler2008'],'This is not supported by evidence.'],
  ['Ask the trainer for the studies behind the claim and check them.','sup',['wineburg2019','facione1990'],'Checking sources is part of evaluating claims.'],
  ['Pupils may have preferences, and it is fine to know them.','part',['pashler2008'],'Preferences exist, but matching teaching to them did not improve learning.'],
  ['Labelling pupils as one type can limit what they try.','sup',['dweck2006'],'Fixed labels can lead to a fixed view of ability.']],
 sol:[['Do not label pupils by learning style.',['pashler2008']],['Choose methods by content and aim.',['harmer2015']],['Ask for evidence behind training claims.',['wineburg2019']]]},

{id:'t37',title:'“Our students are lazy”',skill:'Motivation',level:'A2–B1',
 ctx:'Your mentor in a Grade 10 class says: “These students are lazy. They do not care about English.” You notice that lessons always follow the same textbook routine and students never choose topics. Many students say they want to work in IT or study abroad.',
 facts:[['Class','Grade 10, 26 students'],['Routine','Same textbook steps'],['Choice','None'],['Students’ goals','IT jobs, study abroad']],
 q:['What is the main problem?',['Students are lazy','Lessons do not connect to students’ goals and give no autonomy','English is too difficult'],1,'Motivation depends on conditions the teacher can change.'],
 ai:[['Teachers can build motivation through a supportive atmosphere, relevant tasks and recognising progress.','sup',['dornyei2001'],'These are among Dörnyei’s motivational strategies.'],
  ['Giving students some choice supports intrinsic motivation.','sup',['ryan2000'],'Autonomy is one of the three basic needs.'],
  ['Motivation is a fixed trait; lazy students cannot be changed.','not',['dornyei2001','dweck2006'],'Motivation can be developed by teaching.'],
  ['Link tasks to students’ goals, for example reading short IT job adverts in English.','sup',['dornyei2001','richards2006'],'Relevance supports motivation; real materials fit CLT.'],
  ['Threatening students with low marks will motivate them.','not',['ryan2000'],'Controlling pressure weakens intrinsic motivation.'],
  ['A short survey of students’ interests can guide topic choice.','part',['dornyei2001','black1998'],'Knowing interests helps, but the survey is useful only if it changes the lessons.']],
 sol:[['Ask students about their goals and use them.',['dornyei2001']],['Give choice of topics or tasks.',['ryan2000']],['Use real materials linked to their future.',['richards2006']]]},

{id:'t38',title:'Phones on the desks',skill:'Classroom management',level:'B1',
 ctx:'In an academic lyceum in Tashkent, students keep phones on their desks and check messages during lessons. The teacher shouts and takes phones away, which leads to conflicts. Another teacher lets students use phones for dictionaries and quizzes.',
 facts:[['Group','Grade 11, 22 students'],['Problem','Off-task phone use'],['Teacher A','Takes phones away'],['Teacher B','Uses phones for tasks']],
 q:['What is the main problem?',['Phones are evil','There are no clear, agreed rules and procedures for phone use','Students do not respect teachers'],1,'The issue is the lack of clear procedures.'],
 ai:[['Clear rules and procedures, agreed and taught, are the basis of classroom management.','sup',['marzano2003'],'This is a core element in Marzano’s work.'],
  ['Good relationships between teacher and students reduce conflicts.','sup',['marzano2003'],'Teacher–student relationships are one of the main factors.'],
  ['Phones must always be banned, because they have no learning use.','not',['unesco2023','kumar2001'],'Use depends on purpose and context; technology can support learning if used well.'],
  ['Agree “phones face down unless a task needs them”, and plan tasks that use them.','sup',['marzano2003'],'A clear procedure with a purpose.'],
  ['Shouting is the fastest way to build discipline.','not',['marzano2003'],'Fair, consistent consequences work better than shouting.'],
  ['Let students help write the class phone rules.','part',['ryan2000','marzano2003'],'Involvement supports autonomy, but the teacher must still keep the rules consistent.']],
 sol:[['Agree clear phone procedures.',['marzano2003']],['Use phones for planned tasks.',['unesco2023']],['Keep consequences fair and calm.',['marzano2003']]]},

{id:'t39',title:'The first lesson after the break',skill:'Classroom management',level:'A2',
 ctx:'Your Grade 7 lesson in Bukhara is right after the long break. Pupils come in late, noisy and excited. You lose the first ten minutes every time trying to calm them down.',
 facts:[['Class','Grade 7, 28 pupils'],['Time','After the long break'],['Problem','Late, noisy start'],['Loss','About 10 minutes a lesson']],
 q:['What is the main problem?',['The pupils are badly raised','There is no clear routine for starting the lesson','The break is too long'],1,'A clear start routine saves time.'],
 ai:[['Teach a start-of-lesson routine, for example a short warm-up task already on the board.','sup',['marzano2003'],'Procedures for routine moments are part of effective management.'],
  ['Pupils of this age cannot be calm after a break.','not',['marzano2003'],'Routines can work with all ages.'],
  ['A lively short game in English can use their energy for learning.','sup',['pq1875','harmer2015'],'Games are recommended, and warm-ups are a standard technique.'],
  ['Punish late pupils with extra homework.','part',['marzano2003','cooper2006'],'Consequences have a place, but homework as punishment links learning with punishment.'],
  ['Greeting pupils at the door helps relationships and a calmer start.','sup',['marzano2003'],'Teacher–student relationships are a key factor.'],
  ['Silence for ten minutes is necessary before any learning.','not',['marzano2003'],'A structured task can start learning at once.']],
 sol:[['Put a warm-up task on the board before pupils enter.',['marzano2003']],['Start with a short English game.',['harmer2015']],['Greet pupils and keep the routine consistent.',['marzano2003']]]},

{id:'t40',title:'One student does everything',skill:'Group work',level:'B1',
 ctx:'Second-year students at a pedagogical institute in Gulistan do group projects. In most groups one student does all the work and the others add their names. Students say group work is unfair.',
 facts:[['Group','20 students in groups of 4'],['Task','Group project'],['Problem','One student does the work'],['Feeling','Unfair']],
 q:['What is the main problem?',['Group work is always unfair','The groups lack individual accountability and real interdependence','The project is too big'],1,'Without accountability, some members do nothing.'],
 ai:[['Group work helps learning only with positive interdependence and individual accountability.','sup',['johnson1989'],'These are core conditions of cooperative learning.'],
  ['Give each member a role and a part of the product that is assessed separately.','sup',['johnson1989'],'Roles and individual assessment create accountability.'],
  ['Group work should be replaced by individual work only.','not',['johnson1989','long1985'],'Group work has benefits when it is well organised.'],
  ['Add a short group reflection: what each person did and what to improve.','sup',['johnson1989','schon1983'],'Group processing and reflection are part of cooperative learning.'],
  ['Strong students prefer to work alone, so let them.','part',['johnson1989'],'Some do, but cooperative skills are also a learning goal.'],
  ['Groups of 8 work better than groups of 4.','not',['johnson1989'],'There is no such rule; larger groups make it easier to hide.']],
 sol:[['Assign roles and individual parts.',['johnson1989']],['Assess both the group and the individual.',['johnson1989']],['Add group reflection.',['schon1983']]]},

{id:'t41',title:'Competition every lesson',skill:'Motivation',level:'A2',
 ctx:'A Grade 6 teacher in Andijan turns every lesson into a competition between rows. The same row wins almost every time. Pupils in the losing rows now say “We will lose anyway” and stop trying.',
 facts:[['Class','Grade 6, 30 pupils'],['Practice','Row competitions every lesson'],['Result','Same row always wins'],['Effect','Others give up']],
 q:['What is the main problem?',['Some rows are stupid','Constant competition with the same winners discourages most pupils','Competitions are too short'],1,'When the same pupils always win, others lose motivation.'],
 ai:[['Cooperative goal structures often support learning better than constant competition.','sup',['johnson1989'],'This is a main theme of Johnson and Johnson.'],
  ['Mix teams every time so that each team has different levels.','sup',['johnson1989','tomlinson2014'],'Mixed and changing groups make competition fairer.'],
  ['Competition always destroys learning and must never be used.','not',['hamari2014','johnson1989'],'Occasional, fair competition can motivate; the problem is constant, unfair competition.'],
  ['Pupils in losing rows lack ability.','not',['dweck2006'],'Repeated losing is about team structure, not ability.'],
  ['Reward improvement, not only the highest score.','part',['dweck2006','hattie2007'],'Recognising progress supports effort, but the reward system still needs care.'],
  ['Use the class goal “all of us reach 80%” instead of row against row.','sup',['johnson1989'],'A shared goal creates positive interdependence.']],
 sol:[['Use mixed, changing teams.',['johnson1989']],['Use class goals more often than row competitions.',['johnson1989']],['Recognise improvement.',['dweck2006']]]},

{id:'t42',title:'After a failed exam',skill:'Confidence',level:'B1',
 ctx:'A student at your learning centre in Samarkand failed to get the level she needed in the Multilevel exam. Now she says: “I am not good at languages. I will never pass.” She has stopped coming to speaking club.',
 facts:[['Student','18 years old'],['Exam','Did not reach the needed level'],['Belief','“Not good at languages”'],['Behaviour','Avoids speaking club']],
 q:['What is the main problem?',['She is not talented','She sees one failure as proof of fixed low ability','The exam is unfair'],1,'A fixed-ability belief after failure leads to avoidance.'],
 ai:[['Help her see ability as something that grows with effort and good strategies.','sup',['dweck2006'],'This is the growth mindset approach.'],
  ['Test anxiety can lower exam performance.','sup',['horwitz1986'],'Test anxiety is part of language anxiety.'],
  ['Some people simply have no talent for languages, so she should stop.','not',['dweck2006'],'There is no basis to conclude this from one exam.'],
  ['Analyse her results by skill and set small next goals.','sup',['hattie2007','black1998'],'Clear next steps make feedback useful.'],
  ['She should take the exam again next week to prove herself.','not',['cepeda2006','horwitz1986'],'Quick retakes without learning time are unlikely to help and may raise anxiety.'],
  ['Invite her back to the club with a low-pressure role, such as timekeeper.','part',['macintyre1998','dornyei2001'],'A safe role can rebuild confidence, but she still needs real speaking practice later.']],
 sol:[['Talk about effort, strategy and growth.',['dweck2006']],['Analyse results by skill and set small goals.',['hattie2007']],['Reduce anxiety and rebuild confidence step by step.',['horwitz1986','macintyre1998']]]},

{id:'t43',title:'A boring textbook unit',skill:'Lesson planning',level:'A2–B1',
 ctx:'The next textbook unit in Grade 8 is about “Famous inventors”. The texts are long and the exercises are only “read and answer”. Pupils yawn. You have one week and no extra materials, only the textbook and the board.',
 facts:[['Class','Grade 8, 25 pupils'],['Unit','Famous inventors'],['Materials','Textbook and board only'],['Problem','Boring, passive tasks']],
 q:['What is the main problem?',['The topic is useless','The tasks are passive and give no reason to communicate','Pupils are too young'],1,'The topic can work; the tasks need to involve pupils.'],
 ai:[['Turn the unit into a task with an outcome, such as choosing “the most useful invention” and defending the choice.','sup',['willis1996','ellis2003'],'A task with an outcome gives a reason to use language.'],
  ['Let pupils choose which inventor to read about.','sup',['ryan2000'],'Choice supports autonomy and motivation.'],
  ['A boring textbook cannot be used for communicative teaching.','not',['richards2006','kumar2001'],'Teachers can adapt textbook material to their context.'],
  ['Use an information gap: each pair reads about a different inventor and tells the partner.','sup',['richards2006','long1996'],'Information gaps create real interaction.'],
  ['Pupils must read every text in the unit, otherwise the curriculum is not completed.','part',['sweller1988'],'Covering content matters, but too much reading at once overloads learners; selection is reasonable.'],
  ['Adding a short pre-task on inventions in Uzbekistan can raise interest.','sup',['willis1996','dornyei2001'],'A pre-task introduces the topic; relevance supports motivation.']],
 sol:[['Turn the unit into a task with an outcome.',['willis1996']],['Use an information-gap reading.',['richards2006']],['Give pupils some choice.',['ryan2000']]]},

{id:'t44',title:'The task that became chaos',skill:'Task-based teaching',level:'B1',
 ctx:'You try a task-based lesson in Grade 10: “Plan a class trip to Khiva on a small budget.” You give the task and say “Start!”. Groups do not know what to produce, some argue in Uzbek, and at the end nobody presents anything.',
 facts:[['Class','Grade 10, 24 students'],['Task','Plan a trip on a budget'],['Instructions','Only “Start!”'],['Result','No outcome, no report']],
 q:['What is the main problem?',['Task-based learning does not suit Uzbekistan','The lesson skipped the pre-task, clear outcome and report phases','Khiva is a bad topic'],1,'The task needed preparation and structure.'],
 ai:[['A task-based lesson usually has a pre-task, a task cycle with planning and report, and a language focus.','sup',['willis1996'],'This is Willis’s framework.'],
  ['Tasks need a clear outcome that learners know before they start.','sup',['ellis2003'],'A clear outcome is a defining feature of a task.'],
  ['Task-based teaching is only for advanced learners.','not',['ellis2003','willis1996'],'Tasks can be adapted to many levels.'],
  ['Give each group a budget sheet to complete and a two-minute report.','sup',['willis1996'],'A concrete product and a report phase structure the task.'],
  ['End the lesson with a focus on useful language from the reports.','sup',['willis1996','schmidt1990'],'Language focus after the task helps learners notice forms.'],
  ['Allow some Uzbek in planning but require English in the report.','part',['cook2001'],'Planned L1 use can help, but the teacher must monitor that English is used for the task.']],
 sol:[['Add a pre-task with useful language.',['willis1996']],['Give a clear outcome and product.',['ellis2003']],['Plan report and language focus phases.',['willis1996']]]},

{id:'t45',title:'The teacher talks most of the lesson',skill:'Speaking',level:'B1',
 ctx:'You record your own Grade 9 lesson in Navoi and listen to it. You talk for most of the 45 minutes: explaining, asking and answering your own questions. Pupils speak only a few words each.',
 facts:[['Class','Grade 9, 23 pupils'],['Recording','Your own lesson'],['Finding','Teacher talks most of the time'],['Pupils','A few words each']],
 q:['What is the main problem?',['Pupils have nothing to say','Pupils get too few chances to produce and interact in English','The lesson is too short'],1,'Learners need speaking and interaction time.'],
 ai:[['Learners need to produce language, not only listen to it.','sup',['swain1985'],'This is the Output Hypothesis.'],
  ['Interaction between learners gives chances to negotiate meaning.','sup',['long1996'],'This is the Interaction Hypothesis.'],
  ['Teacher talk is input, so more teacher talk always means more learning.','not',['swain1985','long1996'],'Input is needed, but output and interaction are also needed.'],
  ['Replace some explanations with pair tasks and short pupil presentations.','sup',['long1985'],'Pair work increases learner talk.'],
  ['Recording your own lesson is a useful way to reflect on teaching.','sup',['schon1983','burns2010'],'Reflection and observation are part of reflective practice and action research.'],
  ['Wait longer after questions instead of answering them yourself.','part',['rowe1986'],'Wait time increases participation, but it is only one change among several.']],
 sol:[['Plan more pair and group speaking.',['long1985']],['Use wait time.',['rowe1986']],['Record and reflect again after changes.',['burns2010']]]},

{id:'t46',title:'Too much on one slide',skill:'Materials',level:'A2',
 ctx:'A trainee in Tashkent prepares a slide with 20 new words, their transcriptions, translations, pictures and example sentences, and explains it in five minutes. Afterwards pupils remember almost nothing.',
 facts:[['Class','Grade 7, 26 pupils'],['Slide','20 new words with everything'],['Time','5 minutes'],['Result','Little remembered']],
 q:['What is the main problem?',['The pictures were small','Too much new information was given at once','Pupils did not look at the slide'],1,'Working memory was overloaded.'],
 ai:[['Working memory is limited, so too much new information at once hinders learning.','sup',['sweller1988'],'This is Cognitive Load Theory.'],
  ['Teach fewer words at a time and practise them in use.','sup',['nation2013','sweller1988'],'Fewer items and repeated use support learning.'],
  ['More information on a slide always helps visual learners.','not',['pashler2008','sweller1988'],'Learning-style matching is not supported, and overload hinders learning.'],
  ['Return to the words in the next lessons.','sup',['cepeda2006'],'Spaced practice supports retention.'],
  ['Remove pictures from all slides.','not',['sweller1988'],'Helpful pictures can support understanding; the problem is the amount.'],
  ['Split the slide into four slides with five words each.','part',['sweller1988'],'This reduces load, but pupils still need practice, not only smaller slides.']],
 sol:[['Introduce fewer words at a time.',['sweller1988']],['Practise words in use.',['nation2013']],['Recycle them over the next lessons.',['cepeda2006']]]},

{id:'t47',title:'Only “What is…?” questions',skill:'Questioning',level:'B1',
 ctx:'During a reading lesson in Grade 10, all your questions are like “What is the name of the hero?” and “Where did he live?”. Students answer quickly, but they cannot discuss the author’s opinion or give their own view.',
 facts:[['Class','Grade 10, 20 students'],['Questions','Only factual recall'],['Result','No discussion'],['Goal','Critical thinking']],
 q:['What is the main problem?',['Students are not interested','Questions stay at the remember level and never ask for analysis or evaluation','The text is too easy'],1,'Higher-order thinking needs higher-order questions.'],
 ai:[['Plan questions at different levels: remember, understand, apply, analyse, evaluate, create.','sup',['anderson2001'],'This is the revised taxonomy.'],
  ['Ask “Do you agree with the author? Why?” to practise evaluation.','sup',['anderson2001','facione1990'],'Evaluation is a level in the taxonomy and a core CT skill.'],
  ['Factual questions are useless.','not',['anderson2001'],'Remember-level questions are a base for higher levels.'],
  ['Give students time to think before they answer harder questions.','sup',['rowe1986'],'Wait time leads to longer, better answers.'],
  ['Critical thinking cannot be taught in a language class.','not',['halpern1998'],'Critical thinking can be taught, including in subject classes.'],
  ['Let students write their own questions about the text.','part',['anderson2001'],'This can reach higher levels, but students need models of good questions first.']],
 sol:[['Plan questions at several levels.',['anderson2001']],['Use wait time.',['rowe1986']],['Teach students to ask their own evaluative questions.',['halpern1998']]]},

{id:'t48',title:'Dictation as the only test',skill:'Assessment',level:'A2',
 ctx:'In a Grade 5 class, the teacher uses dictation as the main English test. Pupils who write well in dictation get top marks, even if they cannot understand or say a simple sentence.',
 facts:[['Class','Grade 5, 24 pupils'],['Test','Dictation'],['Result','Marks reflect spelling only'],['Missing','Speaking and understanding']],
 q:['What is the main problem?',['Dictation is too hard','The test does not measure the language ability it claims to measure','Pupils have bad handwriting'],1,'This is a validity problem.'],
 ai:[['A test is valid only if it measures what it is supposed to measure.','sup',['brown2010'],'Validity is a core principle of assessment.'],
  ['Dictation measures all language skills equally well.','not',['brown2010'],'It mainly shows listening-to-spelling skills; it is not a full measure.'],
  ['Add short speaking and listening tasks to the assessment.','sup',['brown2010','coe2001'],'Assessment should cover the skills described in the aims.'],
  ['Young learners should be assessed mostly through oral and playful tasks.','sup',['pq1875'],'Early grades focus on oral activities and games.'],
  ['Remove dictation completely from teaching.','part',['brown2010'],'Dictation can be a useful exercise, but it should not be the main test.'],
  ['Tests influence what pupils think is important.','sup',['alderson1993'],'This is washback.']],
 sol:[['Assess speaking and listening too.',['brown2010']],['Keep dictation as a small exercise.',['brown2010']],['Use playful oral tasks with young pupils.',['pq1875']]]},

{id:'t49',title:'Student teacher’s first plan',skill:'Lesson planning',level:'A2',
 ctx:'Your first lesson plan for teaching practice has 12 activities for 45 minutes: a song, a video, a grammar explanation, three exercises, a game, a reading, a writing task and two quizzes. Your mentor says it is impossible.',
 facts:[['Lesson','45 minutes'],['Plan','12 activities'],['Class','Grade 6'],['Mentor','“Impossible”']],
 q:['What is the main problem?',['The song is not needed','The plan has no clear aim and too many activities for the time','Pupils are too young'],1,'Too many activities leave no time for real learning.'],
 ai:[['A lesson should have one or two clear aims, and activities should serve those aims.','sup',['harmer2015'],'Planning around aims is standard methodology.'],
  ['Too many changes and new items in one lesson overload pupils.','sup',['sweller1988'],'Cognitive load matters in lesson design.'],
  ['More activities always make a lesson more interesting.','not',['sweller1988','harmer2015'],'Quantity does not equal quality.'],
  ['Plan time for practice and use, not only presentation.','sup',['swain1985','richards2006'],'Learners need to produce language.'],
  ['Keep a short “extra” activity in case there is time.','part',['harmer2015'],'A reserve activity is practical, but it should still serve the aim.'],
  ['After teaching, write what worked and what did not.','sup',['schon1983'],'Reflection on action improves future plans.']],
 sol:[['Set one or two clear aims.',['harmer2015']],['Cut to 4–5 activities with practice time.',['sweller1988','richards2006']],['Reflect after the lesson.',['schon1983']]]},

{id:'t50',title:'The useless reflection journal',skill:'Teacher development',level:'—',
 ctx:'During teaching practice, your institute asks you to keep a reflection journal. Most trainees write only “The lesson was good. Pupils were active.” They say the journal is a formality and a waste of time.',
 facts:[['Who','Trainee teachers'],['Task','Reflection journal'],['Typical entry','“The lesson was good.”'],['Attitude','A formality']],
 q:['What is the main problem?',['Reflection is useless','Entries describe events but do not analyse them or plan change','Trainees have no time'],1,'Reflection needs analysis and action, not description only.'],
 ai:[['Professionals learn by reflecting on their actions and turning experience into better decisions.','sup',['schon1983'],'This is the idea of reflective practice.'],
  ['Use guiding questions: What happened? Why? What will I change next time?','sup',['schon1983','burns2010'],'Structured reflection leads to planned change.'],
  ['Turn one problem into a small action research cycle: plan, act, observe, reflect.','sup',['burns2010'],'This is the action research cycle.'],
  ['Reflection is only useful for teachers with many years of experience.','not',['schon1983'],'Reflection supports learning at all stages.'],
  ['Writing more pages makes reflection deeper.','not',['schon1983'],'Depth comes from analysis, not length.'],
  ['Discuss one journal entry with the mentor every week.','part',['schon1983','hattie2007'],'Dialogue can deepen reflection, but only if the mentor gives useful feedback.']],
 sol:[['Use guiding questions in the journal.',['schon1983']],['Turn one problem into action research.',['burns2010']],['Discuss entries with the mentor.',['hattie2007']]]}
);
/* TASKS 51–75: AI in teaching, information and integrity. */
TASKS.push(
{id:'t51',title:'87% AI-generated',skill:'AI & integrity',level:'B2',
 ctx:'A second-year student at your institute submits an English essay. You paste it into a free online AI detector, which says “87% AI-generated”. The student says she wrote it herself; English is her third language after Uzbek and Russian. A colleague says: “87% is proof. Give her zero.”',
 facts:[['Student','2nd year, writes in her 3rd language'],['Tool','Free online AI detector'],['Result','“87% AI-generated”'],['Advice','Give zero']],
 q:['What is the main problem?',['The student is lying','A detector score is being treated as proof','The essay is too long'],1,'Detector scores are not reliable evidence.'],
 ai:[['AI detectors are not accurate and reliable enough to be used as proof of cheating.','sup',['weberwulff2023'],'The study tested 14 tools and found none reliable enough.'],
  ['Detectors have been shown to label many texts by non-native English writers as AI-generated.','sup',['liang2023'],'This is the main finding of Liang et al.'],
  ['An 87% score means there is an 87% chance that the student cheated.','not',['weberwulff2023'],'Detector scores do not work like a probability of cheating.'],
  ['Talk with the student about her writing process and ask her to explain parts of the essay.','sup',['hyland2003','weberwulff2023'],'Evidence about the writing process is more useful than a tool score.'],
  ['Give zero immediately to protect fairness for other students.','not',['weberwulff2023','liang2023'],'Punishing on an unreliable score can be unfair, especially to non-native writers.'],
  ['In future, ask for drafts and notes as part of the assignment.','part',['hyland2003'],'Drafts show the process, but they can also be produced dishonestly; they are one piece of evidence.']],
 sol:[['Do not use detector scores as proof.',['weberwulff2023','liang2023']],['Talk with the student about her process.',['hyland2003']],['Design tasks with drafts and in-class writing.',['hyland2003']]]},

{id:'t52',title:'References from ChatGPT',skill:'AI & research',level:'B2',
 ctx:'A third-year student in Samarkand writes a course paper on teaching vocabulary. He asked ChatGPT for “10 scientific references” and copied them into his bibliography. Three of the books cannot be found in any library catalogue.',
 facts:[['Student','3rd year, course paper'],['Source of references','ChatGPT'],['Problem','3 of 10 books not found'],['Topic','Teaching vocabulary']],
 q:['What is the main problem?',['The library is incomplete','The AI produced references that may be invented, and nobody checked them','The topic is too broad'],1,'AI can fabricate citations; every reference must be checked.'],
 ai:[['ChatGPT has been shown to fabricate a large share of bibliographic citations.','sup',['walters2023'],'This is the main finding of the study.'],
  ['Language models can produce fluent text that is not true (hallucination).','sup',['ji2023'],'This is the definition of hallucination in the survey.'],
  ['If a reference looks correct and complete, it must be real.','not',['walters2023'],'Fabricated references can look complete.'],
  ['Check each reference in a library catalogue, Google Scholar or the publisher’s site.','sup',['wineburg2019','walters2023'],'Checking outside the AI is necessary.'],
  ['For vocabulary, a real, well-known source is Nation’s Learning Vocabulary in Another Language.','sup',['nation2013'],'This book exists and is a standard source.'],
  ['Never use AI in academic work.','part',['kasneci2023','unesco2023'],'AI can help with some tasks, but outputs must be checked; rules depend on the institution.']],
 sol:[['Check every AI reference in real catalogues.',['walters2023']],['Read the real sources before citing them.',['wineburg2019']],['Use AI only with verification.',['unesco2023']]]},

{id:'t53',title:'“Research shows” in an AI lesson plan',skill:'AI & planning',level:'A2',
 ctx:'A trainee asks an AI tool to write a Grade 6 lesson plan on food. The plan says: “Research shows that children remember 80% of words when they sing them.” The trainee wants to put this sentence in her lesson analysis for the methodist.',
 facts:[['Tool','AI chatbot'],['Plan','Grade 6, topic “Food”'],['Claim','“80% of words when they sing”'],['Use','Lesson analysis for the methodist']],
 q:['What is the main problem?',['Songs are bad for learning','An exact statistic is presented without a source and may be invented','The topic is too easy'],1,'Unsourced exact numbers from AI need checking.'],
 ai:[['AI tools can produce confident statements with invented numbers.','sup',['ji2023'],'Hallucination includes non-factual statements.'],
  ['Before using a statistic, find the original study.','sup',['wineburg2019','facione1990'],'Checking sources is part of evaluation.'],
  ['Songs and games are recommended for young learners in Uzbekistan.','sup',['pq1875'],'The resolution stresses playful and oral activities for early grades.'],
  ['The 80% figure is correct because the AI said “research shows”.','not',['ji2023'],'Fluent wording is not evidence.'],
  ['Remove all AI-generated parts from the plan.','part',['kasneci2023'],'AI ideas can be useful if checked; the problem is unchecked claims.'],
  ['Songs work for all children in all classes.','not',['kumar2001'],'Effects depend on learners and context.']],
 sol:[['Remove or verify the statistic.',['ji2023','wineburg2019']],['Keep songs as a reasoned choice for young learners.',['pq1875']],['Explain choices with real sources.',['facione1990']]]},

{id:'t54',title:'An AI-made test',skill:'AI & assessment',level:'A2–B1',
 ctx:'A teacher in Fergana asks an AI tool to create a 20-question grammar test for Grade 8. Without checking, she prints it. In class, pupils find two questions with two correct answers and one question about a grammar point they never studied.',
 facts:[['Tool','AI test generator'],['Test','20 questions, Grade 8'],['Problems','2 questions with 2 answers, 1 off-syllabus'],['Checked?','No']],
 q:['What is the main problem?',['Pupils argue too much','AI output was used without checking its quality and validity','The test was too short'],1,'Teachers must review AI-made materials.'],
 ai:[['A good test must be valid and reliable; items with two correct answers are not reliable.','sup',['brown2010'],'Reliability and validity are core principles.'],
  ['AI output must be checked by a human before use.','sup',['unesco2023'],'UNESCO stresses human validation of AI content.'],
  ['AI-made tests are always better than teacher-made ones.','not',['kasneci2023','brown2010'],'AI can help, but quality must be checked.'],
  ['Test only what was taught; otherwise the test is not valid for the course.','sup',['brown2010'],'Content validity requires alignment with what was taught.'],
  ['Pupils who find errors in the test are showing useful critical thinking.','part',['facione1990'],'Evaluating items is a CT skill, but the test should still be fixed before use.'],
  ['Never use AI to make teaching materials.','not',['kasneci2023','unesco2023'],'AI can support teachers if outputs are checked.']],
 sol:[['Review every AI-made item before printing.',['unesco2023']],['Check validity and reliability.',['brown2010']],['Remove items on content not taught.',['brown2010']]]},

{id:'t55',title:'Pupils’ photos in an AI app',skill:'AI & privacy',level:'—',
 ctx:'A teacher wants to make funny cartoon avatars of all her Grade 5 pupils with a free AI app. She plans to upload their class photos and share the results in the parents’ Telegram group. She did not ask parents.',
 facts:[['Who','Grade 5 pupils (10–11 years)'],['Plan','Upload photos to a free AI app'],['Sharing','Parents’ Telegram group'],['Consent','Not asked']],
 q:['What is the main problem?',['Cartoons are childish','Children’s personal data would be shared without consent','The app is slow'],1,'Photos are personal data; consent and protection are needed.'],
 ai:[['Personal data, such as photos, should be processed only with consent of the person or a legal representative.','sup',['pdlaw2019'],'This is a general rule of the law on personal data.'],
  ['UNESCO guidance stresses protecting learners’ data and privacy when using AI.','sup',['unesco2023'],'Data protection is a main recommendation.'],
  ['A free app is safe because it is popular.','not',['unesco2023'],'Popularity does not show how data are used.'],
  ['Ask parents for written permission and explain where the photos go.','sup',['pdlaw2019'],'Consent from legal representatives is required for children.'],
  ['Use AI to make avatars from drawings the pupils make themselves, without real photos.','part',['unesco2023'],'This reduces risk, but the app’s data rules should still be checked.'],
  ['Since it is only for fun, privacy rules do not apply.','not',['pdlaw2019'],'The law applies to personal data whatever the purpose.']],
 sol:[['Do not upload pupils’ photos without consent.',['pdlaw2019']],['Check the app’s data policy.',['unesco2023']],['Use safer alternatives, such as pupils’ drawings.',['unesco2023']]]},

{id:'t56',title:'Marks list in the parents’ group',skill:'Ethics & privacy',level:'—',
 ctx:'After a test, a Grade 7 teacher in Tashkent posts a photo of the full marks list with names in the parents’ Telegram group “so that parents can compare”. Some parents are upset; one child refuses to go to school.',
 facts:[['Class','Grade 7'],['Action','Full marks list with names posted'],['Channel','Parents’ Telegram group'],['Effect','Upset parents, one child refuses school']],
 q:['What is the main problem?',['Parents are too sensitive','Personal results were shared publicly, causing harm and possibly breaking data rules','The test was too hard'],1,'Marks with names are personal data.'],
 ai:[['Pupils’ marks with their names are personal data and should not be shared without a legal basis or consent.','sup',['pdlaw2019'],'The law on personal data covers such information.'],
  ['Public comparison of marks can increase anxiety and fear of negative evaluation.','sup',['horwitz1986'],'Fear of negative evaluation is a source of anxiety.'],
  ['Comparing children publicly motivates all of them.','not',['dweck2006','deci1999'],'Public ranking can harm motivation, especially of weaker pupils.'],
  ['Send each family only their own child’s result with a comment on next steps.','sup',['hattie2007','pdlaw2019'],'Individual feedback protects privacy and supports learning.'],
  ['Delete the post and apologise to the class and the parents.','part',['marzano2003'],'Repairing relationships matters, but school rules for data should also be set.'],
  ['Teachers can share anything in closed groups.','not',['pdlaw2019'],'A closed group is still sharing personal data with others.']],
 sol:[['Remove the post and apologise.',['marzano2003']],['Share results individually with next steps.',['hattie2007']],['Follow personal data rules.',['pdlaw2019']]]},

{id:'t57',title:'Ban AI at school?',skill:'AI policy',level:'—',
 ctx:'At a teachers’ meeting in a Samarkand school, the director proposes a full ban on AI tools for all pupils and teachers, after a pupil submitted an AI-written essay. Some teachers agree; others say AI could help lesson planning and pupils with homework.',
 facts:[['Event','School teachers’ meeting'],['Proposal','Full ban on AI'],['Reason','One AI-written essay'],['Opinions','Divided']],
 q:['What is the main problem?',['AI is dangerous for everyone','The school needs a reasoned AI policy, not a reaction to one case','Teachers are lazy'],1,'A balanced policy weighs benefits and risks.'],
 ai:[['AI tools offer opportunities for education but also bring risks such as wrong output and over-reliance.','sup',['kasneci2023'],'This is the balanced view of the article.'],
  ['UNESCO recommends a human-centred approach with rules, data protection and AI competences.','sup',['unesco2023'],'These are main points of the guidance.'],
  ['A total ban is the only way to keep education honest.','not',['unesco2023','kasneci2023'],'Guidance recommends regulation and competence-building rather than a single solution.'],
  ['Set age-appropriate rules and teach pupils to check AI output.','sup',['unesco2023'],'Age rules and competences are part of the guidance.'],
  ['Design tasks where pupils show their process, for example drafts and oral explanation.','sup',['hyland2003'],'Process-based tasks make learning visible.'],
  ['Use AI detectors to catch every AI essay.','not',['weberwulff2023','liang2023'],'Detectors are unreliable and biased.']],
 sol:[['Write a balanced school AI policy.',['unesco2023']],['Teach pupils to check AI output.',['kasneci2023']],['Use process-based tasks instead of detectors.',['hyland2003','weberwulff2023']]]},

{id:'t58',title:'AI feedback instead of the teacher',skill:'AI & writing',level:'B1',
 ctx:'A teacher with 150 pupils decides to stop reading pupils’ essays. Pupils will paste their essays into an AI chatbot and correct whatever it says. She says the AI is “more accurate than any teacher”.',
 facts:[['Teacher','150 pupils'],['Plan','AI gives all feedback'],['Claim','AI is more accurate'],['Teacher role','None']],
 q:['What is the main problem?',['AI feedback is always wrong','The teacher gives up her role and trusts AI output without checking','Essays are too short'],1,'AI can support but not replace teacher judgment.'],
 ai:[['AI can give learners quick feedback, but its output can be wrong and learners may over-rely on it.','sup',['kasneci2023','ji2023'],'Both benefits and risks are described.'],
  ['Feedback works best when it shows the learner where to go next and is connected to goals.','sup',['hattie2007'],'This is the feedback model.'],
  ['AI is always more accurate than a teacher.','not',['ji2023'],'AI can produce wrong or invented content.'],
  ['Use AI for first-draft feedback, and give teacher feedback on selected drafts.','part',['kasneci2023','hyland2003'],'A mix can save time, but pupils must learn to judge AI feedback.'],
  ['Teach pupils to question AI suggestions and check them in a grammar book.','sup',['facione1990','unesco2023'],'Evaluation and AI competence are needed.'],
  ['Pupils automatically learn from any correction they copy.','not',['ferris1999','schmidt1990'],'Learning needs noticing and understanding, not copying.']],
 sol:[['Combine AI feedback on drafts with teacher feedback.',['kasneci2023']],['Teach pupils to evaluate AI suggestions.',['facione1990']],['Make feedback goal-based.',['hattie2007']]]},

{id:'t59',title:'Wrong facts about Samarkand',skill:'AI & reading',level:'B1',
 ctx:'You ask an AI tool to write a reading text about Samarkand for Grade 9. The text is fluent and interesting, but it says the Registan was built in one year and names a wrong ruler. A pupil from Samarkand notices.',
 facts:[['Tool','AI text generator'],['Text','Reading about Samarkand'],['Errors','Wrong historical facts'],['Who noticed','A pupil']],
 q:['What is the main problem?',['The pupil is rude','The AI text contains invented facts and was not checked','Reading texts should not be about history'],1,'Fluent AI text can contain false facts.'],
 ai:[['Language models can produce fluent but false content.','sup',['ji2023'],'This is hallucination.'],
  ['Check facts in reliable sources, for example museum or academic websites, before using the text.','sup',['wineburg2019'],'Lateral reading checks information outside the text.'],
  ['If the text is fluent and grammatical, the facts are probably correct.','not',['ji2023'],'Fluency does not mean accuracy.'],
  ['Use the mistake as a lesson: pupils find and correct the wrong facts.','sup',['facione1990','wineburg2019'],'Evaluating claims and checking sources practises critical thinking.'],
  ['Stop using AI texts completely.','part',['kasneci2023'],'AI texts can be useful if checked; the problem is unchecked use.'],
  ['Thank the pupil and show that checking is a valued skill.','sup',['dweck2006','facione1990'],'Valuing inquiry supports critical thinking dispositions.']],
 sol:[['Check facts in reliable sources.',['wineburg2019']],['Turn the errors into a fact-checking task.',['facione1990']],['Keep using AI only with checking.',['kasneci2023']]]},

{id:'t60',title:'A classmate’s AI course paper',skill:'AI & integrity',level:'B2',
 ctx:'Your groupmate in the pedagogical institute tells you that she generated her entire course paper with AI and only changed some words. She asks you not to tell anyone. The paper will be defended next week.',
 facts:[['Who','Your groupmate'],['Action','Whole course paper by AI'],['Request','Keep it secret'],['Deadline','Defence next week']],
 q:['What is the main problem?',['AI is illegal','Presenting AI work as her own breaks academic honesty and skips the learning','The defence is too soon'],1,'The issue is honesty and learning, not technology itself.'],
 ai:[['Using AI is not the problem in itself; hiding its use and not checking it is.','part',['unesco2023','kasneci2023'],'Guidance supports transparent, checked use, but each institution’s rules decide what is allowed.'],
  ['AI-generated academic texts may contain fabricated references.','sup',['walters2023'],'This is shown in the study.'],
  ['Changing some words makes an AI text her own work.','not',['weberwulff2023'],'Paraphrasing hides AI text from detectors but does not make it her own work.'],
  ['Advise her to talk to her supervisor and check every source in the paper.','sup',['walters2023','wineburg2019'],'Checking sources and honest communication reduce harm.'],
  ['The institute should use detectors to catch such papers.','not',['weberwulff2023','liang2023'],'Detectors are unreliable and biased.'],
  ['An oral defence where students explain their choices shows real understanding.','sup',['brown2010'],'Assessing understanding directly gives more valid evidence.']],
 sol:[['Encourage honesty with the supervisor.',['unesco2023']],['Check every source in the paper.',['walters2023']],['Prepare to explain the work orally.',['brown2010']]]},

{id:'t61',title:'AI translates the homework',skill:'AI & writing',level:'A2–B1',
 ctx:'Grade 8 pupils in Andijan write their English homework in Uzbek and then use a translation app. Their texts look perfect, but in class they cannot write even simple sentences without the app.',
 facts:[['Class','Grade 8, 26 pupils'],['Habit','Write in Uzbek, translate with an app'],['Homework','Looks perfect'],['In class','Cannot write simple sentences']],
 q:['What is the main problem?',['The app is bad','Pupils skip the thinking and production that build their own English','Homework is too long'],1,'Learning needs pupils’ own effort to produce English.'],
 ai:[['Learners develop language by producing it themselves, which pushes them to notice gaps.','sup',['swain1985'],'This is the Output Hypothesis.'],
  ['Words are remembered better when tasks involve need, search and evaluation.','sup',['laufer2001'],'Copying a translation involves little search or evaluation.'],
  ['Translation apps always produce wrong English.','not',['kasneci2023'],'They can be useful; the problem is how pupils use them.'],
  ['Give homework that is hard to translate, for example a short reply to a classmate’s message.','part',['ellis2003'],'Communicative tasks help, but pupils can still translate; checking in class matters.'],
  ['Let pupils write a first draft in English alone, then use the app to compare and notice differences.','sup',['schmidt1990'],'Comparing helps learners notice forms.'],
  ['Ban all phones at home.','not',['unesco2023'],'A ban at home cannot be controlled and misses the learning goal.']],
 sol:[['Ask for a first draft in English without the app.',['swain1985']],['Use the app for comparison and noticing.',['schmidt1990']],['Check writing in class regularly.',['black1998']]]},

{id:'t62',title:'A chatbot as a speaking partner',skill:'AI & speaking',level:'B1',
 ctx:'A learning centre in Tashkent advertises: “Our AI chatbot replaces a speaking teacher. Practise with AI and reach B2 in one month.” Your student asks whether she should stop her speaking classes and only talk to the chatbot.',
 facts:[['Advert','AI chatbot replaces a speaking teacher'],['Promise','B2 in one month'],['Student','Wants to stop classes'],['Current level','B1']],
 q:['What is the main problem?',['Chatbots are useless','An advert makes unrealistic promises, and the student may lose human interaction and feedback','The centre is expensive'],1,'The claim needs evidence, and human interaction has value.'],
 ai:[['Interaction where learners negotiate meaning supports acquisition.','sup',['long1996'],'This is the Interaction Hypothesis.'],
  ['A chatbot can give extra speaking practice, but its feedback can be wrong.','sup',['kasneci2023','ji2023'],'Both benefits and risks are described.'],
  ['Reaching B2 from B1 in one month is guaranteed with AI practice.','not',['coe2001'],'CEFR levels describe broad ability; no source supports such a guarantee.'],
  ['Check the advert’s claims by looking for independent reviews and evidence.','sup',['wineburg2019'],'This is lateral reading.'],
  ['Use the chatbot for extra practice between classes, not as a replacement.','part',['kasneci2023'],'This is a balanced use, but the chatbot’s errors still need attention.'],
  ['Human teachers are no longer needed for speaking.','not',['kasneci2023','unesco2023'],'Guidance stresses the human role in education.']],
 sol:[['Keep classes and use the chatbot as extra practice.',['kasneci2023']],['Check advertising claims.',['wineburg2019']],['Discuss realistic progress with CEFR descriptors.',['coe2001']]]},

{id:'t63',title:'AI apps in Grade 4',skill:'AI & young learners',level:'A1',
 ctx:'A Grade 4 teacher wants all pupils to create accounts in a popular AI chatbot and use it for homework. Pupils are 9–10 years old. Some parents agree; others worry.',
 facts:[['Pupils','9–10 years old'],['Plan','Personal AI accounts for homework'],['Parents','Divided'],['Tool','Popular chatbot']],
 q:['What is the main problem?',['Parents are old-fashioned','The plan does not consider age rules, data protection and supervision','Homework is too easy'],1,'Young children need age-appropriate, protected use.'],
 ai:[['UNESCO guidance discusses minimum age limits for independent use of generative AI.','sup',['unesco2023'],'The guidance suggests age limits; it mentions 13 as a minimum age for independent use.'],
  ['Children’s data needs consent from parents.','sup',['pdlaw2019'],'Legal representatives give consent for children.'],
  ['Young children can use any app if the teacher says it is educational.','not',['unesco2023','pdlaw2019'],'Age rules and data protection still apply.'],
  ['Use AI tools in class under teacher control, without personal accounts for children.','part',['unesco2023'],'Supervised use reduces risk, but the teacher must still check the tool and data use.'],
  ['Young learners need playful, oral and hands-on activities in English.','sup',['pq1875'],'This is the approach for early grades.'],
  ['AI will teach children faster than any teacher.','not',['kasneci2023'],'This is not supported; risks and teacher roles are stressed.']],
 sol:[['Do not create personal AI accounts for children.',['unesco2023']],['Ask parents and follow data rules.',['pdlaw2019']],['Focus on playful oral activities.',['pq1875']]]},

{id:'t64',title:'“AI says learning styles matter”',skill:'AI & research',level:'—',
 ctx:'Writing her course paper, a student asks an AI chatbot: “Is it important to match teaching to learning styles?” The AI answers confidently: “Yes, research shows students learn 40% better when taught in their learning style.” She wants to cite this.',
 facts:[['Student','Course paper'],['Question','Learning styles'],['AI answer','“40% better”'],['Plan','Cite it']],
 q:['What is the main problem?',['The AI is broken','The AI repeats a popular myth with an invented number','The topic is not important'],1,'The claim is not supported by research reviews.'],
 ai:[['A major review found no adequate evidence for matching teaching to learning styles.','sup',['pashler2008'],'This is the review’s conclusion.'],
  ['AI tools can repeat popular but false beliefs found in their training data.','part',['ji2023','kasneci2023'],'Hallucination and bias are described, though the exact cause for this answer cannot be known.'],
  ['The 40% figure is reliable because the AI gave a number.','not',['ji2023'],'Exact numbers can be invented.'],
  ['Cite the original research, not the chatbot.','sup',['walters2023','wineburg2019'],'Academic work needs real, checked sources.'],
  ['Students should never ask AI about research.','not',['kasneci2023'],'Asking is fine if the answer is checked.'],
  ['Ask the AI for its sources and check whether they exist.','sup',['walters2023'],'AI sources must be verified; some may be fabricated.']],
 sol:[['Check the claim against research reviews.',['pashler2008']],['Cite original sources only.',['wineburg2019']],['Verify any source the AI names.',['walters2023']]]},

{id:'t65',title:'“The best method for all classes”',skill:'AI & methods',level:'—',
 ctx:'Preparing for her methodology exam, a student asks an AI: “What is the best method for teaching English?” The AI answers: “Communicative Language Teaching is the best method for all classes and all countries.” She writes this in her answer sheet.',
 facts:[['Student','Methodology exam preparation'],['Question','Best method?'],['AI answer','CLT for everyone'],['Use','Exam answer']],
 q:['What is the main problem?',['CLT is wrong','The AI gives an overgeneralised answer that ignores context','The exam is too hard'],1,'No method is best for all contexts.'],
 ai:[['Teaching methods must fit particular learners, teachers and contexts.','sup',['kumar2001'],'This is the particularity parameter of postmethod pedagogy.'],
  ['CLT aims at communicative competence and is widely used.','sup',['richards2006'],'This describes CLT.'],
  ['CLT is the best method for all countries.','not',['kumar2001','larsen2011'],'No single method is shown to be best everywhere.'],
  ['Compare several methods and their principles before choosing.','sup',['larsen2011'],'The book presents methods for conscious choice.'],
  ['Since AI gave the answer, the examiner will accept it.','not',['facione1990'],'Examiners expect reasoned answers, not authority claims.'],
  ['Use the AI answer as a starting point and add limits and examples.','part',['facione1990','kasneci2023'],'This turns the answer into reasoning, but she still needs real sources.']],
 sol:[['Explain that method choice depends on context.',['kumar2001']],['Compare methods with their principles.',['larsen2011']],['Support exam answers with sources.',['facione1990']]]},

{id:'t66',title:'The AI summary that changed the article',skill:'AI & reading',level:'B2',
 ctx:'A master’s student asks an AI to summarise a long English article about formative assessment. The summary says the authors found that “marks are harmful and should be banned”. Her supervisor says the article does not say this.',
 facts:[['Student','Master’s student'],['Task','Summarise an article'],['AI summary','“Marks should be banned”'],['Supervisor','Says this is wrong']],
 q:['What is the main problem?',['The supervisor is wrong','The AI summary misrepresents the original and was not checked against it','The article is too long'],1,'AI summaries can be unfaithful to the source.'],
 ai:[['Text generators can produce summaries that are not faithful to the source.','sup',['ji2023'],'Unfaithful output is a type of hallucination.'],
  ['The formative assessment review shows that using assessment information to improve learning raises achievement.','sup',['black1998'],'This is what the review says.'],
  ['The review concludes that all marks must be banned.','not',['black1998'],'The review does not say this.'],
  ['Always compare an AI summary with the original before citing it.','sup',['ji2023','wineburg2019'],'Checking against the source prevents errors.'],
  ['AI summaries are useless for research.','part',['kasneci2023'],'They can help to get an overview, but they must be checked.'],
  ['Cite the AI tool instead of the article.','not',['walters2023'],'Academic work cites original sources.']],
 sol:[['Read the original article.',['black1998']],['Compare AI summaries with sources.',['ji2023']],['Cite only the original work.',['wineburg2019']]]},

{id:'t67',title:'A Telegram “secret method”',skill:'Information',level:'—',
 ctx:'A popular Telegram channel claims a “secret method” that guarantees IELTS 8.0 in 60 days. It shows screenshots of high scores and asks for a payment. Several of your students want to join.',
 facts:[['Channel','Popular Telegram channel'],['Claim','IELTS 8.0 in 60 days'],['Evidence','Screenshots'],['Ask','Payment']],
 q:['What is the main problem?',['IELTS is too expensive','A strong promise is made with weak evidence','Students are lazy'],1,'Claims must be checked before trusting or paying.'],
 ai:[['Check what independent sources say about the channel before trusting it.','sup',['wineburg2019'],'This is lateral reading.'],
  ['Screenshots of scores are strong scientific evidence.','not',['facione1990'],'Screenshots can be selected or faked; they are not systematic evidence.'],
  ['Language ability develops over time; no method can guarantee a level in a fixed short time.','part',['coe2001','cepeda2006'],'Levels describe broad abilities and learning needs time, but individual progress varies.'],
  ['Ask: who runs the channel, what is the evidence, and what do others say?','sup',['wineburg2019','facione1990'],'These are evaluation questions.'],
  ['If many people follow the channel, its method must work.','not',['facione1990'],'Popularity is not evidence.'],
  ['Spaced, regular practice over months is a better plan than “secret methods”.','sup',['cepeda2006'],'Distributed practice supports long-term learning.']],
 sol:[['Check the channel with lateral reading.',['wineburg2019']],['Ask for real evidence.',['facione1990']],['Plan regular spaced study.',['cepeda2006']]]},

{id:'t68',title:'“Grammar is useless”',skill:'Information',level:'—',
 ctx:'A famous English-teaching blogger with a million followers says in a video: “Grammar teaching is useless. Research proves you only need input.” Some of your Grade 11 students now refuse grammar exercises.',
 facts:[['Source','Popular video blogger'],['Claim','Grammar teaching is useless'],['Effect','Students refuse grammar exercises'],['Class','Grade 11']],
 q:['What is the main problem?',['Students are disrespectful','A strong research claim is accepted without checking the research','The grammar book is old'],1,'The claim must be checked against research.'],
 ai:[['A meta-analysis found that explicit instruction was effective.','sup',['norris2000'],'This contradicts “grammar is useless”.'],
  ['Comprehensible input is important for acquisition.','sup',['krashen1982'],'This is part of Krashen’s theory.'],
  ['Input alone is enough; output is not needed.','not',['swain1985'],'The Output Hypothesis argues that production is also needed.'],
  ['Show students how to check a claim: find the research, see what it really says.','sup',['wineburg2019','facione1990'],'Checking claims is a critical thinking skill.'],
  ['Make grammar practice more meaningful by connecting it to communication.','sup',['spada2008'],'Integrated form-focused instruction connects form and meaning.'],
  ['A blogger with many followers is a reliable scientific source.','not',['wineburg2019'],'Popularity does not show reliability.']],
 sol:[['Discuss the research evidence with students.',['norris2000']],['Teach students to check claims.',['wineburg2019']],['Integrate grammar with communication.',['spada2008']]]},

{id:'t69',title:'A C1 level in ten minutes',skill:'Assessment',level:'B1',
 ctx:'A student shows you a result from a free 10-minute online test: “Your level: C1”. She now wants to skip your B1 course and apply for a C1-level programme. Her writing in class is clearly around B1.',
 facts:[['Test','Free 10-minute online test'],['Result','“C1”'],['Class evidence','About B1'],['Plan','Skip the course']],
 q:['What is the main problem?',['The student is dishonest','A short test is treated as a full measure of ability','The course is too easy'],1,'A short test is not enough evidence for a level.'],
 ai:[['A valid test must measure the abilities it claims to measure.','sup',['brown2010'],'Validity is a core principle.'],
  ['CEFR levels describe ability in several skills with detailed descriptors.','sup',['coe2001'],'The framework covers different skills.'],
  ['A 10-minute online test can reliably measure all four skills.','not',['brown2010'],'A very short test cannot cover speaking and writing.'],
  ['Compare the online result with her work in class using CEFR descriptors.','sup',['coe2001','black1998'],'Several sources of evidence give a better picture.'],
  ['Online tests are always wrong.','not',['brown2010'],'Some tests are useful for limited purposes.'],
  ['Let her try a sample C1 task to see the difference herself.','part',['black1998'],'Self-discovery can help, but it should be done with support to avoid discouragement.']],
 sol:[['Explain test validity.',['brown2010']],['Use CEFR descriptors to compare evidence.',['coe2001']],['Use several sources of evidence.',['black1998']]]},

{id:'t70',title:'Copy-paste presentations',skill:'AI & speaking',level:'B1–B2',
 ctx:'Second-year students give presentations on teaching methods. Many use AI to make slides and read the text from the slides word by word. When you ask a question, they cannot answer.',
 facts:[['Group','2nd-year students'],['Task','Presentations on methods'],['Habit','AI slides, reading aloud'],['Q&A','Cannot answer']],
 q:['What is the main problem?',['AI slides are ugly','Students present content they have not understood','Questions are too hard'],1,'The task does not require understanding.'],
 ai:[['Change the task so students must explain, compare and evaluate methods, not only describe them.','sup',['anderson2001'],'Higher levels of the taxonomy need understanding.'],
  ['Assess the Q&A part, not only the slides.','sup',['brown2010'],'Assessment should measure the target ability.'],
  ['AI-made slides always mean the student cheated.','not',['kasneci2023','unesco2023'],'Use of AI is not cheating by itself; rules and transparency matter.'],
  ['Ask students to name their sources and check them.','sup',['walters2023','wineburg2019'],'AI may fabricate; sources must be checked.'],
  ['Allow only three words per slide.','part',['sweller1988'],'Fewer words reduce reading aloud, but students still need to understand the content.'],
  ['Presentations are not useful for learning.','not',['swain1985'],'Producing language and explaining ideas support learning.']],
 sol:[['Make tasks require explanation and evaluation.',['anderson2001']],['Assess understanding in Q&A.',['brown2010']],['Require checked sources.',['walters2023']]]},

{id:'t71',title:'The fake quote',skill:'Information',level:'B1',
 ctx:'For a debate lesson, a Grade 10 student brings a quote from social media: “Albert Einstein said: Learning English makes you smarter.” Other students accept it immediately because Einstein is famous.',
 facts:[['Lesson','Debate, Grade 10'],['Quote','Attributed to Einstein'],['Source','Social media'],['Reaction','Accepted at once']],
 q:['What is the main problem?',['Einstein is not relevant','An authority is used as proof without checking the source','Debates are too noisy'],1,'Famous names do not make a quote real.'],
 ai:[['Check a quote by searching what reliable sources say about it.','sup',['wineburg2019'],'This is lateral reading.'],
  ['A famous name makes a claim true.','not',['facione1990'],'Evaluation looks at evidence, not only authority.'],
  ['Critical thinkers evaluate the credibility of sources.','sup',['facione1990'],'Evaluation is a core CT skill.'],
  ['Use the quote as a short lesson on checking information.','sup',['halpern1998'],'CT skills transfer better when practised explicitly.'],
  ['Social media never contains true information.','not',['wineburg2019'],'Some information is true; it needs checking.'],
  ['Ask the student who posted the quote first and where.','part',['wineburg2019'],'Tracing origin helps, but students also need to compare with reliable sources.']],
 sol:[['Check the quote with lateral reading.',['wineburg2019']],['Discuss credibility of sources.',['facione1990']],['Practise checking explicitly.',['halpern1998']]]},

{id:'t72',title:'AI-written lesson analysis',skill:'AI & teacher development',level:'—',
 ctx:'Trainees must analyse the lessons they observe during teaching practice. Many submit analyses generated by AI that are polite and general (“The teacher used interactive methods”) and fit any lesson.',
 facts:[['Who','Trainee teachers'],['Task','Lesson observation analysis'],['Problem','General AI-written texts'],['Example','“The teacher used interactive methods”']],
 q:['What is the main problem?',['AI writes badly','The task does not require evidence from the real lesson','Lessons are boring'],1,'Specific evidence makes analysis real.'],
 ai:[['Ask trainees to include concrete evidence: times, quotes and pupils’ reactions.','sup',['schon1983','burns2010'],'Reflection and observation need concrete data.'],
  ['General AI text can sound good but be empty of real evidence.','sup',['ji2023'],'Generated text may not be grounded in facts.'],
  ['Using AI always makes an analysis worthless.','not',['kasneci2023'],'AI can help organise ideas if real observations are used.'],
  ['Use an observation sheet with specific questions during the lesson.','sup',['burns2010'],'Structured observation is part of action research.'],
  ['Discuss the analysis orally with the mentor.','part',['schon1983'],'Discussion deepens reflection, but needs time and a prepared mentor.'],
  ['All lessons can be described with the same analysis.','not',['kumar2001'],'Each lesson and context is particular.']],
 sol:[['Use a structured observation sheet.',['burns2010']],['Require concrete evidence.',['schon1983']],['Discuss analyses with mentors.',['schon1983']]]},

{id:'t73',title:'AI-generated listening for the exam',skill:'AI & listening',level:'B1',
 ctx:'A teacher uses an AI voice tool to create listening tasks for Multilevel exam practice. The voices sound natural, but some recordings have unnatural pauses and stress, and one task has a wrong answer key.',
 facts:[['Tool','AI voice generator'],['Use','Exam listening practice'],['Problems','Odd stress, a wrong key'],['Checked?','Partly']],
 q:['What is the main problem?',['AI voices are illegal','AI-made materials were not fully checked for quality and accuracy','The exam is too hard'],1,'All materials need quality checks.'],
 ai:[['AI-made materials must be checked by a human before use.','sup',['unesco2023'],'Human validation is a key recommendation.'],
  ['A wrong answer key makes the task unreliable.','sup',['brown2010'],'Reliability is a principle of assessment.'],
  ['Unnatural stress can make speech harder to understand.','part',['derwing2005','field2008'],'Prosody affects understanding, but the size of the effect depends on the text and listener.'],
  ['AI listening tasks are always better than real recordings.','not',['kasneci2023'],'Quality varies; checking is needed.'],
  ['Mix AI tasks with authentic recordings.','sup',['field2008'],'Learners need practice with natural connected speech.'],
  ['Teachers do not need to listen to materials before class if AI made them.','not',['unesco2023'],'Teachers remain responsible for content.']],
 sol:[['Listen to and check every AI recording.',['unesco2023']],['Check answer keys.',['brown2010']],['Use authentic recordings too.',['field2008']]]},

{id:'t74',title:'Who wrote this message?',skill:'AI & communication',level:'—',
 ctx:'A parent sends a long, perfect English message to the class teacher asking for a higher mark. The teacher suspects AI wrote it and replies rudely in the parents’ group: “Please write yourself, not with ChatGPT.”',
 facts:[['Who','A parent'],['Message','Long, perfect English'],['Teacher','Replied rudely in public'],['Group','Parents’ group']],
 q:['What is the main problem?',['Parents should not use AI','The teacher judged without evidence and answered publicly and disrespectfully','The mark was too low'],1,'Suspicion is not evidence, and public replies can harm relations.'],
 ai:[['There is no reliable way to prove that a text was written by AI.','sup',['weberwulff2023'],'Detection tools are not reliable.'],
  ['Using AI to write a message is not wrong in itself.','part',['unesco2023'],'Transparency matters, but in private communication it is the person’s choice.'],
  ['Good relationships with families support a positive class climate.','sup',['marzano2003'],'Relationships are central to classroom management.'],
  ['The teacher should reply privately and respond to the request itself.','sup',['pdlaw2019','marzano2003'],'Private replies protect people and relationships.'],
  ['Public criticism makes parents respect the teacher more.','not',['marzano2003'],'It damages relationships.'],
  ['Every perfect English text is AI-written.','not',['liang2023','weberwulff2023'],'Assumptions about writing style are unreliable.']],
 sol:[['Reply privately and politely.',['marzano2003']],['Focus on the request, not the tool.',['unesco2023']],['Do not accuse without evidence.',['weberwulff2023']]]},

{id:'t75',title:'AI for differentiated worksheets',skill:'AI & planning',level:'A2–B1',
 ctx:'A teacher of a mixed-level Grade 7 class in Kokand uses AI to create three versions of a reading worksheet: easy, middle and hard. The texts are good, but the hard version has vocabulary far above the class level and a wrong fact about the topic.',
 facts:[['Class','Grade 7, mixed levels'],['Use','AI-made 3-level worksheets'],['Problem','Hard version too hard, one wrong fact'],['Idea','Differentiation']],
 q:['What is the main problem?',['Differentiation is impossible','The AI output needs checking for level and facts before use','Pupils prefer one worksheet'],1,'AI can support differentiation, but the teacher must check.'],
 ai:[['Differentiating by readiness can help mixed-level classes.','sup',['tomlinson2014'],'This is differentiation.'],
  ['Tasks should be within learners’ zone of proximal development.','sup',['vygotsky1978'],'Too hard is outside the ZPD.'],
  ['AI always matches texts to the right CEFR level.','not',['ji2023','kasneci2023'],'AI output can be inaccurate.'],
  ['Check vocabulary and facts in all versions before using them.','sup',['unesco2023'],'Human checking is needed.'],
  ['Let pupils choose the version they think fits them.','part',['ryan2000','tomlinson2014'],'Choice supports autonomy, but some pupils may choose too easy or too hard.'],
  ['Using AI for planning means the teacher is lazy.','not',['kasneci2023'],'AI can save time when used critically.']],
 sol:[['Use AI drafts for differentiated materials.',['kasneci2023']],['Check level and facts.',['unesco2023']],['Keep tasks within pupils’ ZPD.',['vygotsky1978']]]}
);
/* TASKS 76–100: critical thinking, university teaching, young learners and teacher development. */
TASKS.push(
{id:'t76',title:'Reading the slides aloud',skill:'University teaching',level:'B2',
 ctx:'In a methodology lecture at a university in Samarkand, the lecturer reads 60 slides aloud for 80 minutes. Students copy the slides into notebooks. At the exam, they repeat definitions but cannot apply them to a classroom case.',
 facts:[['Course','Methodology lecture'],['Format','60 slides read aloud'],['Students','Copy slides'],['Exam','Cannot apply ideas']],
 q:['What is the main problem?',['Students do not study','Teaching stays at remembering and never asks students to apply or evaluate','The slides are too colourful'],1,'Application needs practice with cases.'],
 ai:[['Plan learning so that students apply and evaluate ideas, not only remember them.','sup',['anderson2001'],'This follows the revised taxonomy.'],
  ['Short case discussions in pairs during the lecture help students apply ideas.','sup',['long1985','anderson2001'],'Pair work increases participation; cases require application.'],
  ['Copying slides is the best way to learn methodology.','not',['roediger2006','anderson2001'],'Copying is low-level; retrieval and application work better.'],
  ['Use short retrieval questions at the start of each lecture.','sup',['roediger2006'],'Retrieval practice improves retention.'],
  ['Lectures can never develop thinking.','not',['halpern1998'],'Explicit CT teaching can be built into any course.'],
  ['Reduce the number of slides to focus on key ideas.','part',['sweller1988'],'Less information reduces load, but the lecture also needs active tasks.']],
 sol:[['Add case tasks that require application.',['anderson2001']],['Use pair discussion and retrieval questions.',['long1985','roediger2006']],['Focus slides on key ideas.',['sweller1988']]]},

{id:'t77',title:'“Just learn the definition of critical thinking”',skill:'Critical thinking',level:'B2',
 ctx:'In a course on critical thinking for future teachers, students memorise five definitions of critical thinking for the test. In practice, they still accept any statement from a textbook or the internet without questioning it.',
 facts:[['Course','Critical thinking'],['Practice','Memorise definitions'],['Test','Recall definitions'],['Behaviour','Accept any statement']],
 q:['What is the main problem?',['The definitions are wrong','Critical thinking is treated as knowledge to memorise, not as skills to practise','Students are too young'],1,'CT skills must be practised, not only defined.'],
 ai:[['Critical thinking includes skills such as analysis, evaluation and inference, and dispositions such as inquisitiveness.','sup',['facione1990'],'This is the expert consensus.'],
  ['Critical thinking can be taught, and transfer needs explicit practice with many different problems.','sup',['halpern1998'],'This is Halpern’s argument.'],
  ['Knowing definitions is enough to think critically.','not',['halpern1998','facione1990'],'Skills and dispositions need practice.'],
  ['Give students real claims to evaluate every week, such as advertisements or AI answers.','sup',['halpern1998','wineburg2019'],'Practice with varied real material supports transfer.'],
  ['A test of definitions measures critical thinking well.','not',['brown2010','facione1990'],'The test does not measure the skills it claims to.'],
  ['Ask students to explain how their opinion changed after checking evidence.','part',['facione1990'],'This practises self-regulation, but needs a supportive climate to be honest.']],
 sol:[['Practise CT skills with real claims.',['halpern1998']],['Assess skills, not definitions.',['brown2010']],['Include reflection on thinking.',['facione1990']]]},

{id:'t78',title:'The textbook is always right',skill:'Critical thinking',level:'B1',
 ctx:'Grade 11 students read a textbook text that says “People in the UK always drink tea at 5 o’clock.” When you ask whether this is true for everyone, students say: “It is in the book, so it is true.”',
 facts:[['Class','Grade 11'],['Text','Generalisation about British people'],['Belief','Book = truth'],['Goal','Questioning texts']],
 q:['What is the main problem?',['The textbook is bad','Students accept any printed statement without evaluating it','Tea is not important'],1,'Students need to evaluate claims, even in textbooks.'],
 ai:[['Evaluating the credibility of claims is a core critical thinking skill.','sup',['facione1990'],'Evaluation is one of the six skills.'],
  ['Teach students to notice generalising words like “always” and “all” and ask for evidence.','sup',['halpern1998'],'Explicit practice of reasoning skills supports transfer.'],
  ['Textbooks are always wrong, so students should not trust them.','not',['facione1990'],'The aim is evaluation, not distrust of everything.'],
  ['Compare the statement with other sources and with real people’s experiences.','sup',['wineburg2019'],'Checking across sources is lateral reading.'],
  ['Critical questioning of texts is not suitable for school students.','not',['halpern1998'],'CT can be taught at many levels.'],
  ['Discuss stereotypes about Uzbekistan too, so students see how generalisations work.','part',['facione1990'],'Relating to own culture can help, but needs careful, respectful discussion.']],
 sol:[['Teach students to spot generalisations.',['halpern1998']],['Check claims with other sources.',['wineburg2019']],['Practise evaluating credibility.',['facione1990']]]},

{id:'t79',title:'The debate becomes personal',skill:'Speaking',level:'B1–B2',
 ctx:'In a debate lesson at a lyceum in Tashkent about “Should school uniform be compulsory?”, students start insulting each other: “You are stupid”, “Your family is poor”. The lesson ends in conflict.',
 facts:[['Class','Grade 10'],['Activity','Debate on school uniform'],['Problem','Personal insults'],['Result','Conflict']],
 q:['What is the main problem?',['Debates are dangerous','There were no rules for respectful argument and no teaching of how to argue','The topic is boring'],1,'Debate needs rules and argument skills.'],
 ai:[['Set clear rules for discussion before the debate.','sup',['marzano2003'],'Rules and procedures are a base of classroom management.'],
  ['Teach the difference between attacking an argument and attacking a person.','sup',['facione1990','halpern1998'],'Good reasoning and fair-mindedness are part of CT.'],
  ['Debates should never be used in schools.','not',['facione1990','richards2006'],'Debates can develop reasoning and communication when organised well.'],
  ['Give useful phrases for polite disagreement.','sup',['willis1996'],'A pre-task with useful language prepares students.'],
  ['Students who insult others should be expelled from the lesson at once.','part',['marzano2003'],'Consequences are needed, but they should be fair and consistent, not only exclusion.'],
  ['A topic about money and family background is always safe for debate.','not',['marzano2003'],'Topics touching family status can cause conflict; teachers must consider this.']],
 sol:[['Agree debate rules.',['marzano2003']],['Teach how to argue against ideas.',['facione1990']],['Give phrases for polite disagreement.',['willis1996']]]},

{id:'t80',title:'Grade 1 and the writing test',skill:'Young learners',level:'Pre-A1',
 ctx:'In a Grade 1 class in Namangan, parents want the English teacher to give written tests every week so they can see marks. The teacher feels that 7-year-olds should mainly sing, play and speak.',
 facts:[['Class','Grade 1, 7-year-olds'],['Parents','Want weekly written tests'],['Teacher','Prefers games and speaking'],['Level','Beginner']],
 q:['What is the main problem?',['Parents are wrong to care','Expectations do not fit how young beginners learn','The textbook is too thin'],1,'Young beginners learn mainly through oral, playful activities.'],
 ai:[['In Uzbekistan, English in the first grades was introduced in the form of games and oral activities.','sup',['pq1875'],'This is set out in the 2012 resolution.'],
  ['Young learners learn with help in their zone of proximal development, through activity and interaction.','sup',['vygotsky1978'],'This follows Vygotsky.'],
  ['Weekly written tests are the best way to measure 7-year-olds’ English.','not',['brown2010','pq1875'],'Such tests would not be valid for oral, playful learning aims.'],
  ['Show parents what children can do: a song, a short dialogue, a video of a class game.','sup',['black1998'],'Showing evidence of learning informs families.'],
  ['Young children learn languages without any effort, so no teaching method is needed.','not',['vygotsky1978'],'Learning needs support and interaction.'],
  ['Use simple picture-based checks instead of written tests.','part',['brown2010'],'Age-appropriate checks are more valid, but they still need clear aims.']],
 sol:[['Explain the oral, playful approach to parents.',['pq1875']],['Show evidence of learning.',['black1998']],['Use age-appropriate checks.',['brown2010']]]},

{id:'t81',title:'The promise of “IELTS 7 in two months”',skill:'Information',level:'—',
 ctx:'A learning centre in Bukhara puts up a banner: “IELTS 7.0 in two months — 100% guarantee!” A Grade 11 student at B1 level asks you whether she should pay for the course.',
 facts:[['Advert','IELTS 7.0 in 2 months'],['Guarantee','100%'],['Student','B1, Grade 11'],['Question','Should she pay?']],
 q:['What is the main problem?',['The student is too young','The advert promises a result without evidence','IELTS is not useful'],1,'Strong guarantees need evidence.'],
 ai:[['Check independent reviews and what other sources say about the centre.','sup',['wineburg2019'],'This is lateral reading.'],
  ['Progress between levels takes time and depends on the learner.','part',['coe2001','cepeda2006'],'Levels describe broad ability; spaced practice needs time, but individual speed varies.'],
  ['A “100% guarantee” on a banner is strong evidence.','not',['facione1990'],'Advertising claims are not evidence.'],
  ['Ask the centre for its real results: how many students, what starting levels, what final scores.','sup',['facione1990'],'Asking for evidence is part of evaluation.'],
  ['All learning centres in Uzbekistan are dishonest.','not',['facione1990'],'This is an overgeneralisation.'],
  ['Make a long-term study plan with regular practice.','sup',['cepeda2006'],'Distributed practice supports learning.']],
 sol:[['Check the centre’s claims independently.',['wineburg2019']],['Ask for real data.',['facione1990']],['Plan long-term regular study.',['cepeda2006']]]},

{id:'t82',title:'Adults at the mahalla English club',skill:'Motivation',level:'A1–A2',
 ctx:'You volunteer to run an English club for adults at your mahalla centre. In the first meeting 20 people come; by the fourth meeting only 5 come. Participants say they feel embarrassed and the topics are “for children”.',
 facts:[['Who','Adults, 25–55 years'],['Place','Mahalla centre'],['Attendance','20 → 5'],['Complaints','Embarrassment, childish topics']],
 q:['What is the main problem?',['Adults cannot learn languages','The club does not meet adults’ needs and feels unsafe','The room is too small'],1,'Adults need relevant topics and a safe atmosphere.'],
 ai:[['Ask participants about their real needs, for example travel, work or helping children with homework.','sup',['dornyei2001'],'Relevance is a motivational strategy.'],
  ['Create a supportive atmosphere where mistakes are normal.','sup',['krashen1982','horwitz1986'],'Low anxiety supports learning.'],
  ['Adults are too old to learn a new language.','not',['dweck2006'],'Ability develops with effort; age is not a barrier to learning.'],
  ['Give participants choice of topics and activities.','sup',['ryan2000'],'Autonomy supports intrinsic motivation.'],
  ['Use small groups so that people speak with a few others first.','sup',['long1985','macintyre1998'],'Small groups increase talk and willingness to communicate.'],
  ['Give certificates at the end to keep everyone coming.','part',['deci1999'],'Certificates may help some, but rewards alone do not build lasting motivation.']],
 sol:[['Find out adults’ real needs.',['dornyei2001']],['Build a safe, small-group atmosphere.',['horwitz1986','long1985']],['Give choice of topics.',['ryan2000']]]},

{id:'t83',title:'Songs in the lyceum',skill:'Listening',level:'B1',
 ctx:'A teacher at a lyceum uses English pop songs every Friday. Students enjoy them, but the activity is always the same: listen and fill in missing words. The teacher wonders if it is real learning or only fun.',
 facts:[['Class','Grade 10'],['Activity','Songs every Friday'],['Task','Gap-fill lyrics'],['Question','Learning or fun?']],
 q:['What is the main problem?',['Songs are not serious','The activity is always the same and only tests listening','Students sing badly'],1,'Songs can teach more with varied tasks.'],
 ai:[['Enjoyable activities can lower anxiety and support motivation.','sup',['krashen1982','dornyei2001'],'Low anxiety and positive atmosphere help.'],
  ['Gap-fill tasks mainly test listening instead of teaching it.','sup',['field2008'],'This is Field’s point about comprehension tasks.'],
  ['Songs are useless for learning a language.','not',['krashen1982'],'Songs provide input and can lower anxiety.'],
  ['Use songs to notice connected speech, such as linking and weak forms.','sup',['field2008','schmidt1990'],'Teaching the listening process and noticing forms.'],
  ['Every song lesson should end with a written test.','not',['deci1999','brown2010'],'This could turn enjoyment into pressure and is not needed.'],
  ['Let students choose some songs.','part',['ryan2000'],'Choice supports motivation, but the teacher must check the language and content.']],
 sol:[['Vary song tasks to teach listening.',['field2008']],['Use songs to notice connected speech.',['schmidt1990']],['Give students some choice.',['ryan2000']]]},

{id:'t84',title:'Memorised dialogues for the inspector',skill:'Speaking',level:'A2',
 ctx:'For an inspection, Grade 8 pupils memorise long dialogues and perform them perfectly. A week later, they cannot answer a simple question about the same topic in a different way.',
 facts:[['Class','Grade 8'],['Preparation','Memorised dialogues'],['Inspection','Perfect performance'],['After','Cannot answer flexibly']],
 q:['What is the main problem?',['Pupils have weak memory','Memorisation without meaningful use does not build flexible speaking','The inspector was strict'],1,'Learners need to use language creatively.'],
 ai:[['Memorised dialogues can be a first scaffold but should lead to free use.','sup',['wood1976'],'Scaffolding is reduced over time.'],
  ['Learners need to produce their own language to develop speaking.','sup',['swain1985'],'This is the Output Hypothesis.'],
  ['Memorisation is the best way to learn to speak.','not',['swain1985','richards2006'],'Speaking develops through meaningful use.'],
  ['Change the dialogue step by step: new names, new places, then free versions.','sup',['wood1976'],'Gradual reduction of support.'],
  ['Performances for inspections show real learning.','not',['black1998'],'Rehearsed performance hides real ability.'],
  ['Record pupils’ free versions and compare them over time.','part',['black1998'],'Evidence of progress helps, but it takes time to organise.']],
 sol:[['Use dialogues as a scaffold, not a goal.',['wood1976']],['Move to free variations.',['swain1985']],['Collect evidence of real progress.',['black1998']]]},

{id:'t85',title:'The repetitor’s homework',skill:'Homework',level:'B1',
 ctx:'Many of your Grade 9 pupils go to private tutors (repetitors). Their homework for you is often perfect but written by the tutor. In class tests, these pupils get low marks.',
 facts:[['Class','Grade 9'],['Situation','Tutors help with homework'],['Homework','Perfect'],['Tests','Low marks']],
 q:['What is the main problem?',['Tutors are bad','Homework does not show pupils’ own learning','Tests are too hard'],1,'Homework done by others gives no learning or evidence.'],
 ai:[['Homework helps more when pupils do it themselves and it practises what was learned in class.','sup',['cooper2006'],'This follows the homework review.'],
  ['Give homework that builds on class work and is checked briefly in class.','sup',['black1998'],'Using homework as formative information.'],
  ['All tutors write pupils’ homework.','not',['facione1990'],'This is an overgeneralisation.'],
  ['Ask pupils to explain or use their homework orally in class.','sup',['brown2010'],'Direct evidence of understanding.'],
  ['Stop giving homework completely.','not',['cooper2006'],'Homework has benefits in secondary school.'],
  ['Talk with parents about how tutors can support without doing the work.','part',['black1998'],'Cooperation with families helps, but the school cannot control tutors.']],
 sol:[['Link homework to class and check it orally.',['black1998','brown2010']],['Keep homework short and personal.',['cooper2006']],['Talk with parents about tutor support.',['black1998']]]},

{id:'t86',title:'A CV in English',skill:'Writing',level:'B1',
 ctx:'Final-year students at a university in Tashkent want to apply for jobs in international companies. They write their CVs in English by translating their Uzbek CVs word by word. The results look strange to employers.',
 facts:[['Students','Final year'],['Task','English CVs'],['Method','Word-by-word translation'],['Result','Strange-looking CVs']],
 q:['What is the main problem?',['Students’ English is too weak','Students do not know how this genre is organised in English','Employers are too strict'],1,'Genres have their own structure and conventions.'],
 ai:[['Each genre has typical organisation and language that readers expect.','sup',['hyland2003'],'This is the genre approach.'],
  ['Analyse real English CVs and their sections before writing.','sup',['hyland2003'],'Model analysis is part of genre teaching.'],
  ['Word-by-word translation always produces correct English texts.','not',['hyland2003'],'Genre conventions differ between languages.'],
  ['Use peer feedback with a checklist of CV sections.','sup',['topping1998'],'Peer assessment with criteria helps.'],
  ['Use an AI tool to write the CV and send it without reading.','not',['ji2023','unesco2023'],'AI output must be checked and fit the person.'],
  ['Write a first draft, get feedback, then revise.','part',['hyland2003'],'Drafting helps, but feedback must focus on the genre, not only grammar.']],
 sol:[['Analyse real CVs as models.',['hyland2003']],['Draft, get peer feedback and revise.',['topping1998']],['Check any AI help carefully.',['unesco2023']]]},

{id:'t87',title:'A student with hearing difficulties',skill:'Inclusion',level:'A2',
 ctx:'A Grade 6 pupil in your class has hearing difficulties. He sits at the back and misses most listening tasks. The teacher says: “He cannot learn English. Let him draw quietly.”',
 facts:[['Pupil','Hearing difficulties'],['Seat','Back of the room'],['Problem','Misses listening tasks'],['Teacher','Wants him to draw']],
 q:['What is the main problem?',['The pupil is lazy','The teaching is not adapted to his needs','English is too hard for him'],1,'Differentiation means adapting, not excluding.'],
 ai:[['Teachers can differentiate the process and the product to meet different needs.','sup',['tomlinson2014'],'This is differentiation.'],
  ['Seat him near the teacher and give written support for listening tasks.','sup',['tomlinson2014'],'Adapting process to needs.'],
  ['He cannot learn English, so he should only draw.','not',['dweck2006','tomlinson2014'],'Learners can develop with appropriate support.'],
  ['A classmate can help him with notes during tasks.','part',['vygotsky1978','johnson1989'],'Peer support can help, but the teacher keeps responsibility.'],
  ['Ask the family and the school for information about how he learns best.','sup',['black1998'],'Information about learners guides teaching.'],
  ['All pupils with special needs should learn in separate schools.','not',['tomlinson2014'],'This generalisation ignores the individual and his context.']],
 sol:[['Change seating and give written support.',['tomlinson2014']],['Learn about his needs from family and school.',['black1998']],['Adapt tasks, do not exclude.',['tomlinson2014']]]},

{id:'t88',title:'No projector, a slide-based plan',skill:'Lesson planning',level:'A2',
 ctx:'You arrive at a village school in Syrdarya region for teaching practice with a lesson built on 25 slides and videos. The projector is broken, and the internet is weak. You have 45 minutes and only a board.',
 facts:[['School','Village school'],['Plan','25 slides and videos'],['Problem','No projector, weak internet'],['Resources','Board and chalk']],
 q:['What is the main problem?',['The school is poor','The plan depends on technology that is not available','The class is too big'],1,'Plans must fit local practical conditions.'],
 ai:[['Teaching must fit practical local conditions.','sup',['kumar2001'],'This is the practicality parameter.'],
  ['Use the board, pictures you draw and pair tasks instead.','sup',['ur2012','long1985'],'Low-resource techniques and pair work.'],
  ['Without slides, a lesson cannot be modern.','not',['kumar2001','richards2006'],'Communicative teaching does not depend on slides.'],
  ['Always prepare a plan B without technology.','sup',['harmer2015'],'Flexibility is part of good planning.'],
  ['Cancel the lesson until the projector is repaired.','not',['kumar2001'],'Teaching should adapt, not stop.'],
  ['Tell stories and use real objects from the classroom.','part',['harmer2015'],'These can work, but they must still match the lesson aim.']],
 sol:[['Adapt the lesson to the board and pair work.',['ur2012','long1985']],['Keep a plan B without technology.',['harmer2015']],['Fit methods to local conditions.',['kumar2001']]]},

{id:'t89',title:'Silence in the online lesson',skill:'Online teaching',level:'B1',
 ctx:'During winter, a university in Karakalpakstan moves some seminars online. Students turn off cameras and microphones. When you ask questions, nobody answers. You talk alone for 80 minutes.',
 facts:[['Format','Online seminar'],['Students','Cameras and mics off'],['Interaction','None'],['You','Talk alone']],
 q:['What is the main problem?',['Online learning is impossible','The online lesson has no structured interaction','Students are asleep'],1,'Interaction must be designed online too.'],
 ai:[['Use breakout rooms for short pair or group tasks.','sup',['long1985','johnson1989'],'Small groups increase participation.'],
  ['Give students time to think and write answers in the chat before speaking.','sup',['rowe1986'],'Wait time increases participation.'],
  ['Students who turn off cameras do not want to learn.','not',['macintyre1998'],'Willingness to communicate depends on many factors.'],
  ['Give each group a clear task and product to share.','sup',['willis1996'],'Task with outcome and report.'],
  ['Make cameras compulsory and give zero to anyone without a camera.','part',['marzano2003','pdlaw2019'],'Clear expectations help, but punishment and privacy concerns need care.'],
  ['Online lessons cannot include real interaction.','not',['long1996','long1985'],'Interaction can be designed online too, for example in small groups.']],
 sol:[['Plan breakout tasks with products.',['willis1996']],['Use wait time and chat answers.',['rowe1986']],['Set clear, fair online procedures.',['marzano2003']]]},

{id:'t90',title:'The mentor’s harsh feedback',skill:'Teacher development',level:'—',
 ctx:'After your first lesson in teaching practice, your mentor says in front of the pupils: “That was a terrible lesson. You are not born to be a teacher.” You feel hurt and do not know what to improve.',
 facts:[['Who','You, a trainee'],['Feedback','Public, harsh'],['Content','“Not born to be a teacher”'],['Effect','No clear next steps']],
 q:['What is the main problem?',['You are a bad teacher','The feedback is about the person, not the lesson, and gives no next steps','The pupils were noisy'],1,'Useful feedback is specific and focused on improvement.'],
 ai:[['Effective feedback focuses on the task and process and shows next steps.','sup',['hattie2007'],'This is the feedback model.'],
  ['Teaching skills develop with practice, reflection and feedback.','sup',['schon1983','dweck2006'],'Reflective practice and growth mindset.'],
  ['Some people are born teachers; others can never learn.','not',['dweck2006'],'Ability develops.'],
  ['Ask the mentor for two concrete things to change in the next lesson.','sup',['hattie2007'],'“Where to next?” makes feedback usable.'],
  ['Write a reflection on the lesson and plan one change.','sup',['schon1983','burns2010'],'Reflection leads to action.'],
  ['Report the mentor to the director immediately.','part',['marzano2003'],'Problems should be raised, but a calm conversation first may solve more.']],
 sol:[['Ask for specific, task-focused feedback.',['hattie2007']],['Reflect and plan one change.',['schon1983']],['Remember that teaching skills grow.',['dweck2006']]]},

{id:'t91',title:'Action research on quiet pupils',skill:'Teacher development',level:'A2',
 ctx:'You are writing your graduation paper and want to study why pupils in your practice class do not speak. Your supervisor suggests action research, but you do not know how to start.',
 facts:[['Who','Graduating student'],['Problem','Quiet pupils'],['Suggested method','Action research'],['Difficulty','How to start']],
 q:['What is the main problem?',['Action research is too hard','A clear cycle and data plan are missing','The class is too small'],1,'Action research follows a cycle with data.'],
 ai:[['Action research follows cycles of planning, acting, observing and reflecting.','sup',['burns2010'],'This is Burns’s model.'],
  ['Start by collecting data: count how many pupils speak and ask them why.','sup',['burns2010'],'Observation and data are part of the cycle.'],
  ['A short anxiety questionnaire can show whether fear is involved.','part',['horwitz1986'],'The FLCAS measures anxiety, but it must be adapted and translated carefully for pupils.'],
  ['Try one change, such as pair work before whole-class speaking, and observe the effect.','sup',['burns2010','long1985'],'Acting on a plan and observing is the core of the cycle.'],
  ['Action research needs a large sample to be valid.','not',['burns2010'],'It studies one’s own class to improve practice.'],
  ['You can finish action research in one lesson.','not',['burns2010'],'It usually needs more than one cycle.']],
 sol:[['Plan a cycle: plan, act, observe, reflect.',['burns2010']],['Collect data on speaking and anxiety.',['horwitz1986']],['Try one change and observe.',['long1985']]]},

{id:'t92',title:'Students believe every AI answer',skill:'Critical thinking',level:'B1',
 ctx:'In your Grade 11 group, students use AI chatbots for homework questions and copy the answers. When you show that one AI answer about English history is wrong, a student says: “But AI knows everything.”',
 facts:[['Class','Grade 11'],['Habit','Copy AI answers'],['Belief','“AI knows everything”'],['Evidence','A wrong AI answer']],
 q:['What is the main problem?',['AI is bad','Students trust AI output without evaluating it','Homework is too easy'],1,'AI output must be evaluated like any source.'],
 ai:[['AI can produce fluent but false content.','sup',['ji2023'],'This is hallucination.'],
  ['Teaching students to evaluate claims and check sources builds critical thinking.','sup',['facione1990','halpern1998'],'Evaluation is a core skill that can be taught.'],
  ['AI answers are correct if they sound confident.','not',['ji2023'],'Confidence of wording is not evidence.'],
  ['Give regular tasks where students check an AI answer with two other sources.','sup',['wineburg2019'],'Checking across sources builds habits.'],
  ['Forbid students from using AI for any homework.','part',['unesco2023','kasneci2023'],'Rules may be needed, but teaching critical use is more useful in the long term.'],
  ['UNESCO recommends building AI competences of learners.','sup',['unesco2023'],'This is a key recommendation.']],
 sol:[['Show examples of AI errors.',['ji2023']],['Practise checking AI answers with other sources.',['wineburg2019']],['Build AI competences.',['unesco2023']]]},

{id:'t93',title:'Peer correction in speaking',skill:'Speaking',level:'B1',
 ctx:'In your Grade 10 speaking lessons, you ask students to correct each other’s mistakes. Some students correct aggressively and laugh. Others are afraid to speak in front of them.',
 facts:[['Class','Grade 10'],['Practice','Peer correction'],['Problem','Aggressive correction'],['Effect','Fear of speaking']],
 q:['What is the main problem?',['Peer correction is always bad','Peer feedback has no rules or training, and it creates fear','The topics are too hard'],1,'Peer feedback needs training and a safe climate.'],
 ai:[['Peer feedback can work when students are trained and criteria are clear.','sup',['topping1998'],'This is Topping’s conclusion.'],
  ['Fear of negative evaluation increases language anxiety.','sup',['horwitz1986'],'This is a component of anxiety.'],
  ['Students should correct every mistake they hear.','not',['ellis2009'],'Selective feedback is better than correcting everything.'],
  ['Give peers one focus, for example “past tense only”, and a polite phrase to use.','sup',['ellis2009','topping1998'],'Focused, trained feedback.'],
  ['Stop all peer feedback forever.','not',['topping1998'],'It can work with training.'],
  ['Let students choose whether they want peer feedback today.','part',['ryan2000'],'Choice can reduce anxiety, but some students may always avoid feedback.']],
 sol:[['Train students in polite, focused feedback.',['topping1998']],['Limit the focus of correction.',['ellis2009']],['Protect a safe climate.',['horwitz1986']]]},

{id:'t94',title:'The vocabulary game nobody learns from',skill:'Vocabulary',level:'A2',
 ctx:'Grade 6 pupils love an online vocabulary game with points and music. They play for 20 minutes every lesson. At the end of the term, they recognise the words in the game but cannot use them in sentences.',
 facts:[['Class','Grade 6'],['Activity','Online vocabulary game'],['Time','20 minutes a lesson'],['Result','Recognition, no use']],
 q:['What is the main problem?',['Games are useless','Practice stays at recognition and does not lead to use','The game is too short'],1,'Learners need to use words, not only recognise them.'],
 ai:[['Gamified activities can motivate, but effects depend on the context.','sup',['hamari2014'],'This is the review’s conclusion.'],
  ['Words are learned better when learners use them in their own sentences.','sup',['laufer2001','nation2013'],'Involvement and output strands.'],
  ['If pupils enjoy a game, they always learn from it.','not',['hamari2014'],'Enjoyment does not guarantee learning.'],
  ['After the game, ask pupils to write or say sentences with five of the words.','sup',['swain1985','laufer2001'],'Output and involvement support learning.'],
  ['Shorten the game to 10 minutes and add a speaking task.','part',['nation2013'],'Balancing strands helps, but the right time depends on the lesson.'],
  ['Online games should replace the teacher.','not',['kasneci2023','unesco2023'],'Technology supports teaching but does not replace it.']],
 sol:[['Follow the game with a use task.',['laufer2001']],['Balance the four strands.',['nation2013']],['Use games as one part of the lesson.',['hamari2014']]]},

{id:'t95',title:'Grammar rules in Russian, lessons in Uzbek',skill:'Classroom language',level:'B1',
 ctx:'In an institute group in Samarkand, some students studied at Russian-medium schools and some at Uzbek-medium schools. The teacher explains grammar in Russian. Uzbek-medium students understand little and stop asking.',
 facts:[['Group','Mixed school backgrounds'],['Explanations','In Russian'],['Problem','Uzbek-medium students lost'],['Behaviour','Stop asking']],
 q:['What is the main problem?',['Uzbek-medium students are weaker','Explanations use one language not all students share','Grammar is too hard'],1,'Language of explanation should be accessible to all.'],
 ai:[['Students can use all their languages to support learning.','sup',['garcia2014'],'This is translanguaging.'],
  ['Explain in simple English with examples, and allow short clarification in a shared language.','sup',['cook2001'],'Planned L1 use with English as main language.'],
  ['Students from Uzbek-medium schools cannot learn English grammar well.','not',['dweck2006'],'No basis for this claim.'],
  ['Pair students with different backgrounds to check understanding.','sup',['vygotsky1978','garcia2014'],'Peers can support each other in their ZPD and with shared languages.'],
  ['Using any language except English is always wrong.','not',['cook2001'],'Planned L1 use is supported.'],
  ['Provide a short glossary of grammar terms in Uzbek, Russian and English.','part',['cook2001'],'This can help access, but understanding still needs examples and practice.']],
 sol:[['Use simple English with examples.',['cook2001']],['Allow planned use of shared languages.',['garcia2014']],['Use mixed pairs for checking.',['vygotsky1978']]]},

{id:'t96',title:'The viral statistic',skill:'Information',level:'B1',
 ctx:'For a lesson on media, Grade 11 students bring a viral post: “80% of Uzbek youth will work abroad by 2030.” They want to use it in their presentations. No source is given.',
 facts:[['Class','Grade 11'],['Post','Viral statistic'],['Claim','80% will work abroad by 2030'],['Source','None given']],
 q:['What is the main problem?',['The topic is political','An unsourced statistic is accepted as fact','Presentations are too short'],1,'Unsourced numbers must be checked.'],
 ai:[['Check the claim by searching for the original source and what other sources say.','sup',['wineburg2019'],'This is lateral reading.'],
  ['A number without a source is not evidence.','sup',['facione1990'],'Evaluation requires credible sources.'],
  ['If many people share a post, it must be true.','not',['facione1990'],'Popularity is not evidence.'],
  ['Turn the post into a fact-checking task for the class.','sup',['halpern1998'],'Practice with real material supports transfer.'],
  ['Students should never use statistics in presentations.','not',['facione1990'],'Statistics are useful when sourced.'],
  ['Compare the claim with official statistics if they exist.','part',['wineburg2019'],'Official data help, but they must also be read carefully.']],
 sol:[['Search for the original source.',['wineburg2019']],['Use only sourced numbers.',['facione1990']],['Practise fact-checking.',['halpern1998']]]},

{id:'t97',title:'Cheating in the term test',skill:'Ethics',level:'B1',
 ctx:'During a Grade 10 term test in Kashkadarya, several students share answers through phones. The teacher notices only after the test. The test results are very similar for these students.',
 facts:[['Class','Grade 10'],['Event','Answers shared by phone'],['Discovered','After the test'],['Evidence','Similar answers']],
 q:['What is the main problem?',['Students are dishonest by nature','The test design and procedures made cheating easy and the results are not valid','Phones are too cheap'],1,'Procedures and test design affect validity.'],
 ai:[['If students copy answers, the test no longer measures their ability.','sup',['brown2010'],'Validity is lost.'],
  ['Clear procedures, such as phones collected before tests, prevent problems.','sup',['marzano2003'],'Procedures are key in management.'],
  ['All students who got similar answers cheated.','not',['facione1990'],'Similarity is not proof; evidence must be considered.'],
  ['Use different versions of the test and some open questions.','sup',['brown2010'],'Test design affects reliability and security.'],
  ['Talk with the students before deciding consequences.','part',['marzano2003'],'Fair procedure matters, but the school’s rules must also be followed.'],
  ['Give everyone in the class a zero.','not',['marzano2003'],'Collective punishment is not fair or consistent.']],
 sol:[['Set clear test procedures.',['marzano2003']],['Design tests that are harder to copy.',['brown2010']],['Act fairly, based on evidence.',['facione1990']]]},

{id:'t98',title:'One more grammar lesson or speaking?',skill:'Curriculum',level:'B1',
 ctx:'In your institute, students have 4 hours of English a week. A new teacher wants to use all hours for grammar because “speaking comes later”. Students say they need speaking for their future jobs.',
 facts:[['Hours','4 a week'],['Plan','All grammar'],['Belief','Speaking comes later'],['Students','Need speaking for jobs']],
 q:['What is the main problem?',['Grammar is useless','The plan ignores the balance of skills and learners’ needs','There are too few hours'],1,'A balanced course serves learners’ goals.'],
 ai:[['A balanced course includes input, output, language focus and fluency.','sup',['nation2013'],'These are the four strands.'],
  ['Explicit grammar instruction is effective.','sup',['norris2000'],'The meta-analysis supports this.'],
  ['Speaking should only start after grammar is fully learned.','not',['swain1985','richards2006'],'Output and communication develop language along the way.'],
  ['Integrate grammar into speaking tasks.','sup',['spada2008'],'Integrated form-focused instruction.'],
  ['Ask students about their needs and plan with them.','sup',['dornyei2001'],'Relevance supports motivation.'],
  ['Split the hours equally between all skills, always.','part',['nation2013'],'Balance is good, but exact proportions depend on needs.']],
 sol:[['Plan with the four strands.',['nation2013']],['Integrate grammar into communication.',['spada2008']],['Consider students’ needs.',['dornyei2001']]]},

{id:'t99',title:'A lesson plan from AI for the whole term',skill:'AI & planning',level:'A2–B1',
 ctx:'A new teacher in a Tashkent school asks AI to write all lesson plans for the term. The plans look professional, but they do not match the class textbook, the pupils’ level or the 45-minute lessons.',
 facts:[['Teacher','New, first year'],['Tool','AI lesson plans for a term'],['Problem','No fit with textbook, level, time'],['Look','Professional']],
 q:['What is the main problem?',['AI plans are illegal','Generic plans are used without adapting them to the real class','The term is too long'],1,'Plans must fit learners and context.'],
 ai:[['Methods and plans must fit particular learners and conditions.','sup',['kumar2001'],'Particularity and practicality.'],
  ['AI output can look professional but contain errors or mismatches.','sup',['ji2023','kasneci2023'],'Risks of AI output.'],
  ['AI lesson plans fit any class automatically.','not',['kumar2001'],'Context must be considered.'],
  ['Use AI ideas, but adapt aims, timing and materials to the class.','sup',['unesco2023','harmer2015'],'Human control and good planning.'],
  ['A new teacher should never use AI.','not',['kasneci2023'],'AI can support planning if used critically.'],
  ['Reflect after each lesson and improve the next plan.','part',['schon1983'],'Reflection helps, but it needs time each week.']],
 sol:[['Adapt AI ideas to the class.',['kumar2001']],['Check AI plans for errors.',['ji2023']],['Reflect and improve plans.',['schon1983']]]},

{id:'t100',title:'Evaluating an AI answer in your own field',skill:'Critical thinking',level:'B2',
 ctx:'For your final seminar, your group asks an AI: “How should a teacher in Uzbekistan develop students’ critical thinking?” The AI gives a long, confident answer with some good ideas, two unnamed “studies” and no examples from Uzbek schools.',
 facts:[['Who','Your final-year group'],['Question','Developing critical thinking'],['AI answer','Long, confident'],['Problems','Unnamed studies, no local context']],
 q:['What is the main problem?',['The AI is useless','The answer mixes useful ideas with unsupported claims and ignores the local context','The question is too difficult'],1,'Good evaluation separates useful ideas from unsupported claims.'],
 ai:[['Critical thinking involves analysis, evaluation, inference, explanation and self-regulation.','sup',['facione1990'],'These are core skills in the Delphi Report.'],
  ['Critical thinking can be taught explicitly and practised with many different problems.','sup',['halpern1998'],'This is Halpern’s argument.'],
  ['“Studies show” without names is reliable evidence.','not',['walters2023','ji2023'],'Unnamed or unchecked studies may be invented.'],
  ['Ideas must be adapted to Uzbek classrooms and learners.','sup',['kumar2001'],'Particularity of context.'],
  ['Questions at higher levels (analyse, evaluate) can develop thinking.','sup',['anderson2001'],'The revised taxonomy supports planning such questions.'],
  ['The AI answer can be used as it is in the seminar paper.','not',['unesco2023','walters2023'],'AI output must be checked and sourced.']],
 sol:[['Separate supported ideas from unsupported claims.',['facione1990']],['Find the real studies or remove the claims.',['walters2023']],['Adapt ideas to the local context.',['kumar2001']]]}
);
/* Short Uzbek support line for every task (shown small under the situation).
   ASCII apostrophes; build_site.py converts them (o' g' -> oʻ gʻ, other -> ʼ). */
const TASK_UZ={
t1:"9-sinf oʻquvchilari xato qilishdan qoʻrqib, ingliz tilida gapirmayapti.",
t2:"Savollarga har doim faqat uch oʻquvchi javob beradi.",
t3:"Oʻquvchilar bir-birining talaffuzi ustidan kulishadi.",
t4:"Juftlikdagi topshiriqda oʻquvchilar oʻzbekcha gaplashib ketishadi.",
t5:"Guruhda oʻzbek, tojik va rus tilida soʻzlashuvchi oʻquvchilar bor.",
t6:"Yulduzcha va reyting oʻquvchilarni faqat ball uchun ishlashga oʻrgatdi.",
t7:"Ochiq dars oldidan butun darsni yodlatib chiqish taklif qilinmoqda.",
t8:"Juftlikdagi ish paytida sinf shovqinli boʻlib ketadi.",
t9:"32 oʻquvchi, qimirlamaydigan partalar va proyektor yoʻq.",
t10:"Talabalar qoidani biladi, lekin nutqda ishlatmaydi.",
t11:"Oʻqituvchi har bir xatoni darhol toʻxtatib toʻgʻrilaydi.",
t12:"Inshodagi har bir xato qizil ruchka bilan tuzatiladi, natija yoʻq.",
t13:"Litseyda faqat grammatika va tarjima oʻtiladi.",
t14:"Oʻzbek tilida artikl yoʻq, talabalar uni ishlatishda adashadi.",
t15:"1-sinfdagi \"faqat ingliz tilida\" qoidasi bolalarni qiynamoqda.",
t16:"Dars toʻliq takrorlash mashqlaridan iborat.",
t17:"Har hafta 50 ta soʻz yodlanadi, bir oyda unutiladi.",
t18:"Oʻquvchilar matndagi har bir soʻzni lugʻatdan tarjima qilishadi.",
t19:"Tinglash faqat test sifatida oʻtkaziladi.",
t20:"Imtihonning tinglash qismida oʻquvchilar vahimaga tushadi.",
t21:"Insho bir marta yoziladi va qayta ishlanmaydi.",
t22:"Talabalar Telegramdagi tayyor IELTS shablonlarini yodlashadi.",
t23:"Talabalar bir-biriga fikr bildirishni istamaydi.",
t24:"Oʻqituvchi faqat \"th\" tovushiga eʼtibor beradi, urgʻu esa eʼtibordan chetda.",
t25:"Matn navbatma-navbat ovoz chiqarib oʻqiladi, mazmun tushunilmaydi.",
t26:"Darslar faqat imtihon testlariga tayyorlashga aylangan.",
t27:"Ikki oʻqituvchi bir talabaga turlicha baho qoʻydi.",
t28:"Oʻquvchilar izohlarni oʻqimaydi, faqat bahoga qaraydi.",
t29:"Chorakda faqat bitta test oʻtkaziladi.",
t30:"Oʻquvchilar oʻzini baholay oladimi?",
t31:"\"Sen juda aqllisan!\" degan maqtov taʼsiri.",
t32:"Har dars boshidagi qisqa savolnoma foydalimi?",
t33:"5-sinf oʻquvchisi har kuni 3 soat uy vazifasi bajaradi.",
t34:"Oʻqituvchi faqat olimpiadaga tayyorlanayotgan ikki oʻquvchi bilan ishlaydi.",
t35:"Bir guruhda A1 va B2 darajadagi talabalar bor.",
t36:"Seminarda \"oʻrganish uslubi\" ilmiy isbotlangan deb aytildi.",
t37:"Ustoz oʻquvchilarni dangasa deb hisoblaydi.",
t38:"Darsda telefon boʻyicha aniq qoida yoʻq.",
t39:"Tanaffusdan keyingi dars shovqin bilan boshlanadi.",
t40:"Guruh loyihasini bitta talaba bajaradi.",
t41:"Doimiy musobaqada bir qator yutadi, qolganlar taslim boʻladi.",
t42:"Imtihondan oʻta olmagan talaba oʻziga ishonchini yoʻqotdi.",
t43:"Darslikdagi boʻlim zerikarli, faqat \"oʻqi va javob ber\".",
t44:"Topshiriqqa asoslangan dars tartibsizlikka aylandi.",
t45:"Dars davomida asosan oʻqituvchi gapiradi.",
t46:"Bitta slaydda 20 ta yangi soʻz berildi.",
t47:"Savollar faqat eslab qolishga qaratilgan.",
t48:"Diktant yagona test sifatida ishlatilmoqda.",
t49:"45 daqiqalik dars rejasida 12 ta faoliyat bor.",
t50:"Refleksiya kundaligi rasmiyatchilikka aylangan.",
t51:"Detektor inshoni \"87% sunʼiy intellekt\" deb koʻrsatdi.",
t52:"ChatGPT bergan manbalarning bir qismi mavjud emas.",
t53:"AI dars rejasida manbasiz statistika bor.",
t54:"AI tuzgan testda xatolar chiqdi.",
t55:"Oʻquvchilar rasmlarini ruxsatsiz AI ilovaga yuklash rejasi.",
t56:"Baholar roʻyxati ismlar bilan ota-onalar guruhiga tashlandi.",
t57:"Maktabda AIʼni toʻliq taqiqlash taklif qilindi.",
t58:"Oʻqituvchi inshoni oʻqimay, fikrni toʻliq AIʼga topshirmoqchi.",
t59:"AI yozgan matnda Samarqand haqida notoʻgʻri faktlar bor.",
t60:"Guruhdosh kurs ishini toʻliq AI bilan yozgan.",
t61:"Uy vazifasi tarjima ilovasi orqali bajariladi.",
t62:"Reklama: \"AI chatbot gapirish oʻqituvchisini almashtiradi\".",
t63:"4-sinf oʻquvchilari uchun shaxsiy AI akkaunt ochish rejasi.",
t64:"AI \"oʻrganish uslubi\" haqida toʻqima raqam berdi.",
t65:"AI \"hamma uchun eng yaxshi metod\" deb javob berdi.",
t66:"AI maqola mazmunini notoʻgʻri qisqartirdi.",
t67:"Telegram kanal \"maxfiy metod\" va kafolat vaʼda qiladi.",
t68:"Bloger \"grammatika keraksiz\" deb daʼvo qildi.",
t69:"10 daqiqalik onlayn test \"C1\" darajani koʻrsatdi.",
t70:"Taqdimotlar AI slaydlaridan oʻqib beriladi.",
t71:"Mashhur shaxsga tegishli soxta iqtibos.",
t72:"Dars tahlillari AI yozgan umumiy matnlardan iborat.",
t73:"AI ovozida tayyorlangan tinglash topshiriqlarida xatolar bor.",
t74:"Oʻqituvchi ota-onani ochiq guruhda \"AI bilan yozgansiz\" deb aybladi.",
t75:"AI tayyorlagan uch darajali topshiriq varaqalari tekshirilmagan.",
t76:"Maʼruzada 60 ta slayd oʻqib beriladi.",
t77:"Tanqidiy fikrlash taʼriflari yodlatiladi, koʻnikma rivojlanmaydi.",
t78:"Oʻquvchilar darslikdagi har bir gapni haqiqat deb qabul qilishadi.",
t79:"Munozara shaxsiy haqoratlarga aylandi.",
t80:"Ota-onalar 1-sinf uchun har haftalik yozma test soʻrashmoqda.",
t81:"\"Ikki oyda IELTS 7.0, 100% kafolat\" reklamasi.",
t82:"Mahalladagi kattalar uchun ingliz tili toʻgaragiga kam odam qoldi.",
t83:"Qoʻshiqlar faqat boʻsh joyni toʻldirish uchun ishlatiladi.",
t84:"Tekshiruv uchun dialoglar yodlatildi.",
t85:"Uy vazifasini repetitor yozib beradi.",
t86:"Ingliz tilidagi rezyume soʻzma-soʻz tarjima qilinadi.",
t87:"Eshitishda qiyinchiligi bor oʻquvchi darsdan chetda qolmoqda.",
t88:"Proyektor ishlamaydi, dars esa slaydlarga qurilgan.",
t89:"Onlayn seminarda talabalar jim, kamera va mikrofon oʻchiq.",
t90:"Ustozning qoʻpol fikri: \"Sen oʻqituvchi boʻlib tugʻilmagansan\".",
t91:"Jim oʻquvchilar boʻyicha harakatli tadqiqotni qanday boshlash kerak?",
t92:"Oʻquvchilar \"AI hamma narsani biladi\" deb oʻylashadi.",
t93:"Oʻzaro xato tuzatish oʻquvchilarni qoʻrqitmoqda.",
t94:"Oʻyin orqali soʻzlarni taniydi, lekin gapda ishlata olmaydi.",
t95:"Grammatika rus tilida tushuntiriladi, oʻzbek maktabini bitirganlar tushunmaydi.",
t96:"Manbasiz statistikali post taqdimotga olinmoqchi.",
t97:"Test paytida javoblar telefon orqali tarqatildi.",
t98:"Haftalik barcha soatlarni faqat grammatikaga ajratish rejasi.",
t99:"Butun chorak uchun dars rejalari AIʼdan olingan.",
t100:"Tanqidiy fikrlash haqidagi AI javobini baholash."
};
/* =====================================================================
   4C CORE — task normalisation, what is needed to move on, the final
   AI feedback (Gemini, through the server) with an automatic fallback,
   XP, badges, records and export.
   The AI feedback is a learning aid, not a validated test of critical
   thinking. Its criteria follow five of the six core skills described in
   the Delphi Report (Facione, 1990).
   ===================================================================== */

/* ---------- task bank: numbers, option order, lookups ---------- */
const TASK_BY_ID={};
TASKS.forEach((t,i)=>{
  t.num=i+1;
  /* the correct option is not always the middle one: rotate the three options by task number */
  const rot=(t.num*2)%3,o=t.q[1],opts=[];o.forEach((x,k)=>{opts[(k+rot)%3]=x});
  t.q1={ask:t.q[0],options:opts,best:(t.q[2]+rot)%3,why:t.q[3]};
  t.statements=t.ai.map(a=>({text:a[0],v:a[1],src:a[2],why:a[3]}));
  t.solution=(t.sol||[]).map(s=>({text:s[0],src:s[1]}));
  t.uz=TASK_UZ[t.id]||'';
  TASK_BY_ID[t.id]=t});
/* which tasks cite each source (shown in the Library) */
const SRC_USED={};
TASKS.forEach(t=>{const ks=new Set();t.statements.forEach(s=>s.src.forEach(k=>ks.add(k)));t.solution.forEach(s=>s.src.forEach(k=>ks.add(k)));ks.forEach(k=>{(SRC_USED[k]=SRC_USED[k]||[]).push(t.num)})});

/* ---------- what is needed to move to the next stage (kept small) ---------- */
const reasonText=r=>String(r||'').replace(/^\s*because\b[\s,.:…]*/i,'');
function reqs(at,stage){
  const d=at.d,o=[];
  if(stage===1)o.push({label:'Choose the main problem',ok:d.think.pick>=0},{label:'Write what you would do and why (5+ words)',ok:W(d.think.initial)>=5});
  if(stage===2)o.push({label:'Read the AI suggestion',ok:!!d.consult.read});
  if(stage===3){o.push({label:'Agree, partly agree or disagree',ok:!!d.check.agree},{label:'Explain why (4+ words)',ok:W(reasonText(d.check.reason))>=4},{label:'Answer: do you need to check a source?',ok:!!d.check.source});
    if(d.check.source==='yes')o.push({label:'Open the source of at least one statement',ok:Object.keys(d.check.opened).length>=1})}
  if(stage===4)o.push({label:'Write your final solution and why (8+ words)',ok:W(d.decide.final)>=8},{label:'Say how your opinion changed',ok:!!d.decide.change});
  return o}
const stageOk=(at,s)=>reqs(at,s).every(r=>r.ok);
function canEnter(at,n){if(n>at.maxStage)return false;for(let s=1;s<n;s++)if(!stageOk(at,s))return false;return true}

/* ---------- automatic estimate (used only when the AI feedback is not available) ---------- */
const KEYWORDS=/\b(anxi\w*|afraid|fear\w*|safe\w*|confiden\w*|pair\w*|group\w*|feedback|correct\w*|source\w*|evidence|research|context|level|because|therefore|however|instead|check\w*|motivat\w*|support\w*|scaffold\w*)\b/gi;
const kw=s=>(String(s||'').match(KEYWORDS)||[]).length;
function autoEstimate(at){
  const t=TASK_BY_ID[at.taskId],d=at.d,opened=Object.keys(d.check.opened).length,c=d.decide.change;
  const cl=v=>Math.max(1,Math.min(5,Math.round(v)));
  const sc={
    analysis:cl(1+(d.think.pick===t.q1.best?2:0)+(W(d.think.initial)>=12?1:0)+(kw(d.think.initial)>=2?1:0)),
    evaluation:cl(1+(d.check.agree&&d.check.agree!=='agree'?1:0)+(W(reasonText(d.check.reason))>=10?1:0)+(kw(d.check.reason)>=1?1:0)+(opened>=3?1:0)),
    inference:cl(1+(d.check.source==='yes'?1:0)+Math.min(2,Math.floor(opened/2))+(/\b(because|so|therefore|since)\b/i.test(d.decide.final)?1:0)),
    explanation:cl(1+(W(d.decide.final)>=15?1:0)+(W(d.decide.final)>=30?1:0)+(/\b(because|since|so that|therefore)\b/i.test(d.decide.final)?1:0)+(kw(d.decide.final)>=2?1:0)),
    self:cl(1+(c&&c!=='none'?1:0)+(kw(d.decide.final)>kw(d.think.initial)?1:0)+(W(d.decide.final)>W(d.think.initial)?1:0)+(opened>=1?1:0))};
  const overall=cl(avg(COMP.map(x=>sc[x.key])));
  const changed=c&&c!=='none';
  return {mode:'auto',ts:Date.now(),scores:sc,overall,
    start:excerpt(d.think.initial,220),end:excerpt(d.decide.final,220),
    change:changed?'You said your opinion changed during the task.':'You said your opinion did not change.',
    useful:changed||opened>=2?'partly':'unclear',usefulWhy:opened?`You opened the sources of ${opened} of ${t.statements.length} AI statements.`:'You did not open any sources.',
    conclusion:'This is an automatic estimate made on this device from the length, links and key ideas in your answers, because the AI feedback was not available. Ask your teacher to read your answers too.',
    next:opened<t.statements.length?'Next time, open the source of every AI statement before you decide.':'Next time, use the evidence you found in your final solution.'}}

/* ---------- the AI feedback (Gemini through the server) ---------- */
function evalPayload(at){
  const t=TASK_BY_ID[at.taskId],d=at.d,ag=(AGREE.find(a=>a[0]===d.check.agree)||[])[1]||'',ch=(CHANGE.find(a=>a[0]===d.decide.change)||[])[1]||'';
  const lines=[
   'TASK: '+t.title,
   'MAIN PROBLEM QUESTION: '+t.q1.ask+' Student chose: "'+(t.q1.options[d.think.pick]||'-')+'". Best answer: "'+t.q1.options[t.q1.best]+'".',
   'STUDENT\'S FIRST OPINION (before AI): '+excerpt(d.think.initial,500),
   'AI SUGGESTION THE STUDENT READ (with the verdict from the Source Library):',
   ...t.statements.map((s,i)=>`${i+1}. ${s.text} [${VERDICT[s.v].label}: ${s.why}]`),
   'STUDENT\'S POSITION ON THE AI SUGGESTION: '+ag+'. Reason: '+excerpt(d.check.reason,400),
   'DID THE STUDENT CHECK SOURCES: '+(d.check.source==='yes'?'yes, opened the sources of statements '+(Object.keys(d.check.opened).map(i=>+i+1).sort((a,b)=>a-b).join(', ')||'none'):'no'),
   'STUDENT\'S FINAL SOLUTION: '+excerpt(d.decide.final,700),
   'STUDENT SAYS THE OPINION: '+ch];
  return lines.join('\n').slice(0,3900)}
async function requestEval(at){
  if(!at||at.evalBusy)return;
  at.evalBusy=true;at.evalErr='';refreshResult(at);
  try{
    await capsReady();
    if(!API.base||API.caps.err||!API.caps.ai)throw apiErr(API.caps.err||'not_configured',0);
    const t=TASK_BY_ID[at.taskId],e=await askBackendEval(t.ctx,evalPayload(at));
    at.eval=Object.assign({mode:'ai',ts:Date.now()},e);
    awardEvalBadges(at);
  }catch(err){
    at.evalErr=consultErrText(err);
    if(!at.eval)at.eval=autoEstimate(at)}
  at.evalBusy=false;persistNow();refreshResult(at)}
function awardEvalBadges(at){
  if(at.sample||!at.eval||at.eval.mode!=='ai')return;
  if(at.eval.overall>=4&&awardBadge('deep-thinker')){(ui.justBadges=ui.justBadges||[]).push('deep-thinker')}}
const evalOf=at=>at.eval||autoEstimate(at);

/* ---------- finishing a task ---------- */
const xpForTask=at=>{const o=Object.keys(at.d.check.opened).length;return 20+3*o+(at.d.think.pick===TASK_BY_ID[at.taskId].q1.best?5:0)};
function completeAttempt(at,opt){
  opt=opt||{};
  at.status='completed';at.completedAt=Date.now();
  const xp=xpForTask(at),badges=[],d=at.d;
  at.result={xp};
  if(!opt.sample){
    addXP(xp);bumpStreak();
    if(completedList().filter(a=>!a.sample).length===1&&awardBadge('first-step'))badges.push('first-step');
    if(Object.keys(d.check.opened).length>=TASK_BY_ID[at.taskId].statements.length&&awardBadge('source-checker'))badges.push('source-checker');
    if(d.decide.change&&d.decide.change!=='none'&&W(d.decide.final)>=15&&awardBadge('open-mind'))badges.push('open-mind');
    if(currentStreak()>=3&&awardBadge('streak-3'))badges.push('streak-3');}
  persistNow();return{xp,badges}}

/* ---------- sample record (clearly labelled, no XP, no AI request) ---------- */
function createSample(){
  const t=TASK_BY_ID.t1,at=newAttempt(t.id),d=at.d;
  d.think.pick=t.q1.best;d.think.initial='I would ask the students to speak more and give them more grammar practice first.';
  d.consult.read=true;
  d.check.agree='partly';d.check.reason='Because pair work is a good idea, but the 90% number has no source and correcting every error can make them more afraid.';
  d.check.source='yes';[0,1,2,4,5].forEach(i=>{d.check.opened[i]=true});
  d.decide.final='My final solution is to make speaking safe first: a class rule about mistakes, short pair tasks, scripted dialogues that I remove step by step, and delayed feedback on a few errors, because the students are afraid of being laughed at.';
  d.decide.change='partly';
  at.stage=4;at.maxStage=4;at.sample=true;completeAttempt(at,{sample:true});at.eval=autoEstimate(at);persistNow();return at}

/* ---------- structured records and export ---------- */
function recordObject(at){
  const t=TASK_BY_ID[at.taskId],d=at.d,e=evalOf(at),label=(arr,k)=>(arr.find(a=>a[0]===k)||[])[1]||null;
  return{recordId:at.id,sampleRecord:!!at.sample,status:at.status,startedAt:new Date(at.createdAt).toISOString(),completedAt:at.completedAt?new Date(at.completedAt).toISOString():null,
    student:S.profile.name||null,cycle:'AI-CT 4C (Contextualize, Consult, Critique, Construct)',
    task:{id:t.id,number:t.num,skill:t.skill,title:t.title,situation:t.ctx},
    contextualize:{mainProblemChoice:t.q1.options[d.think.pick]||null,correctChoice:d.think.pick===t.q1.best,firstOpinion:d.think.initial},
    consult:{aiSuggestion:t.statements.map(s=>s.text),note:'Prepared AI-style suggestion for this task; each statement has a verdict and sources in the Source Library.'},
    critique:{position:label(AGREE,d.check.agree),reason:d.check.reason,checkedSources:d.check.source,
      statementsOpened:Object.keys(d.check.opened).map(i=>+i+1).sort((a,b)=>a-b),
      statements:t.statements.map((s,i)=>({n:i+1,text:s.text,verdict:VERDICT[s.v].label,sources:s.src.map(srcShort),opened:!!d.check.opened[i]}))},
    construct:{finalSolution:d.decide.final,opinionChange:label(CHANGE,d.decide.change)},
    feedback:{source:e.mode==='ai'?'AI (Gemini, via server)':'Automatic estimate on this device',criteria:'Facione (1990): analysis, evaluation, inference, explanation, self-regulation; 1 to 5',
      scores:e.scores,overall:e.overall,start:e.start,end:e.end,change:e.change,useful:e.useful,usefulWhy:e.usefulWhy,conclusion:e.conclusion,next:e.next},
    xp:at.result?at.result.xp:null}}
/* CSV cell: quotes escaped, and text that a spreadsheet could run as a formula (=, +, -, @) is neutralised with a leading apostrophe. */
const csvCell=v=>{const isNum=typeof v==='number'&&isFinite(v);v=v==null?'':String(v);
  if(!isNum&&/^[=+\-@\t\r]/.test(v))v="'"+v;
  return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
function toCSV(list){
  const cols=['record_id','sample','student','task_number','task','started','completed','main_problem_correct','first_opinion','position','reason','checked_sources','statements_opened','final_solution','opinion_change','feedback_source',...COMP.map(c=>'score_'+c.key),'overall','conclusion','xp'];
  const rows=list.map(at=>{const r=recordObject(at),f=r.feedback;
    return[at.id,at.sample?'yes':'no',r.student,r.task.number,r.task.title,r.startedAt,r.completedAt,r.contextualize.correctChoice,r.contextualize.firstOpinion,r.critique.position,r.critique.reason,r.critique.checkedSources,r.critique.statementsOpened.join(' '),r.construct.finalSolution,r.construct.opinionChange,f.source,...COMP.map(c=>f.scores?f.scores[c.key]:''),f.overall,f.conclusion,r.xp].map(csvCell).join(',')});
  return[cols.join(','),...rows].join('\n')}
async function doExport(kind,id){
  const list=id?[S.attempts[id]]:completedList();
  if(!list.length){toast('No completed records to export yet');return}
  const stamp=new Date().toISOString().slice(0,10);
  const data=kind==='json'?JSON.stringify({prototype:'AI-CT TEACHER',cycle:'4C',exportedAt:new Date().toISOString(),note:'Records from one student\'s device. Feedback scores are a learning aid, not a validated measure.',records:list.map(recordObject)},null,2):toCSV(list);
  const filename=`ai-ct-teacher-${id?'record':'records'}-${stamp}.${kind}`;
  if(AI.downloads){try{await AI.downloads.save({filename,data});toast('Export ready');return}catch(e){if(e&&e.code==='declined')return}}
  try{const blob=new Blob([(kind==='csv'?'﻿':'')+data],{type:kind==='json'?'application/json':'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('Export downloaded');return}catch(e){}
  await modal({title:'Copy your export',html:`<p class="small muted">Downloading is not available here. Copy the text into a file named <b>${esc(filename)}</b>.</p><pre class="export" tabindex="0">${esc(data.slice(0,60000))}</pre>`,actions:[{label:'Close',val:true}]})}
/* =====================================================================
   METHOD CHALLENGE — question bank
   10 English-teaching methods x 3 difficulties (easy / medium / advanced).
   Each question: a short classroom scenario, 3 options, one correct
   answer, and a short explanation shown after answering.
   ===================================================================== */
const METHODS = [
  {key:'clt',name:'Communicative Language Teaching'},
  {key:'tblt',name:'Task-Based Language Teaching'},
  {key:'pbl',name:'Project-Based Learning'},
  {key:'prbl',name:'Problem-Based Learning'},
  {key:'coop',name:'Cooperative Learning'},
  {key:'gtm',name:'Grammar-Translation Method'},
  {key:'direct',name:'Direct Method'},
  {key:'alm',name:'Audio-Lingual Method'},
  {key:'flipped',name:'Flipped Classroom'},
  {key:'cbi',name:'Content-Based Instruction'}
];
const METHOD_BY_KEY=Object.fromEntries(METHODS.map(m=>[m.key,m]));

const MC_QUESTIONS=[
 {id:'clt-e',method:'clt',diff:'easy',
  q:'Students work in pairs. One has a picture, the other does not. They ask questions to find the differences. The teacher does not correct every mistake during the activity.',
  options:['Communicative Language Teaching','Grammar-Translation Method','Audio-Lingual Method','Flipped Classroom'],correct:0,
  explain:'CLT focuses on real communication and getting the message across, not perfect grammar during speaking.'},
 {id:'clt-m',method:'clt',diff:'medium',
  q:'The teacher gives students a real-life topic, like planning a class trip, and lets them use any English they know to discuss it. Getting the message across matters more than perfect grammar.',
  options:['Grammar-Translation Method','Communicative Language Teaching','Direct Method','Audio-Lingual Method'],correct:1,
  explain:'This is a CLT activity: meaningful communication is the goal, and fluency is valued over perfect accuracy.'},
 {id:'clt-a',method:'clt',diff:'advanced',
  q:'In a CLT lesson, the teacher notices a grammar mistake while students are doing a role-play. What does the teacher most likely do?',
  options:['Stop the activity at once and explain the rule','Note the mistake and address it briefly after the activity ends','Ignore every mistake forever','Stop the activity and ask students to translate the sentence into their first language'],correct:1,
  explain:'In CLT, teachers usually let communication continue and give feedback afterward, so the flow of the conversation is not interrupted.'},

 {id:'tblt-e',method:'tblt',diff:'easy',
  q:'Students work together to plan a birthday party in English: make a list, agree a budget, and write invitations. Grammar is discussed only after the task is finished.',
  options:['Task-Based Language Teaching','Grammar-Translation Method','Audio-Lingual Method','Flipped Classroom'],correct:0,
  explain:'A real task with a clear outcome, followed by language feedback, is the core pattern of Task-Based Language Teaching.'},
 {id:'tblt-m',method:'tblt',diff:'medium',
  q:'The lesson has three parts: the teacher introduces the topic; students complete a real task, like booking a hotel room by role-play, using any language they can; then the class reviews useful language that came up.',
  options:['Direct Method','Task-Based Language Teaching','Content-Based Instruction','Grammar-Translation Method'],correct:1,
  explain:'This pre-task, task, and language-focus structure is a classic TBLT lesson shape.'},
 {id:'tblt-a',method:'tblt',diff:'advanced',
  q:'How is Task-Based Language Teaching usually different from a typical Communicative Language Teaching activity?',
  options:['TBLT always avoids group work','TBLT is built around one specific, outcome-focused task, with language form usually addressed afterward','TBLT never allows any communication','TBLT is just the Grammar-Translation Method with a new name'],correct:1,
  explain:'TBLT is organised specifically around completing a task with a clear outcome; explicit language work usually comes after the task, not before it.'},

 {id:'pbl-e',method:'pbl',diff:'easy',
  q:'Over three weeks, students research a topic, interview people, and create a short documentary video in English to present to the school.',
  options:['Project-Based Learning','Audio-Lingual Method','Grammar-Translation Method','Direct Method'],correct:0,
  explain:'An extended activity that produces a real final product, like a video, is the hallmark of Project-Based Learning.'},
 {id:'pbl-m',method:'pbl',diff:'medium',
  q:'A class spends two weeks creating an English-language magazine about their city, with articles, interviews and photos, to send to a partner school abroad.',
  options:['Direct Method','Project-Based Learning','Content-Based Instruction','Audio-Lingual Method'],correct:1,
  explain:'A multi-step activity building toward one real, shareable product over an extended time is Project-Based Learning.'},
 {id:'pbl-a',method:'pbl',diff:'advanced',
  q:'What most distinguishes Project-Based Learning from a single Problem-Based Learning lesson?',
  options:['Projects are usually shorter than one class period','Project-Based Learning typically runs over an extended period and ends in a tangible product; a Problem-Based Learning task can be solved within one lesson','There is no real difference between them','Project-Based Learning never produces anything that students can share'],correct:1,
  explain:'Both involve investigation, but Project-Based Learning is usually longer and ends with a concrete product, while Problem-Based Learning can be a single focused lesson.'},

 {id:'prbl-e',method:'prbl',diff:'easy',
  q:'Students work in small groups. They discuss a real-life problem and find a solution.',
  options:['Problem-Based Learning','Grammar-Translation Method','Lecture Method','Audio-Lingual Method'],correct:0,
  explain:'Correct! Problem-Based Learning helps students learn through solving meaningful problems.'},
 {id:'prbl-m',method:'prbl',diff:'medium',
  q:'The teacher presents a case: "A tourist is lost and cannot speak the local language. What should they do?" Groups investigate and propose solutions in English, picking up vocabulary as they need it.',
  options:['Problem-Based Learning','Audio-Lingual Method','Direct Method','Grammar-Translation Method'],correct:0,
  explain:'Starting from a real problem and learning language along the way, as it is needed, is typical of Problem-Based Learning.'},
 {id:'prbl-a',method:'prbl',diff:'advanced',
  q:'In Problem-Based Learning, when is new language or content usually introduced?',
  options:['Before the problem, in a full lecture','As students need it, while they work to solve the problem','Never — PrBL avoids introducing anything new','Only after the final test, as a review'],correct:1,
  explain:'In PrBL, learning happens in response to the problem, not before it in a separate lecture.'},

 {id:'coop-e',method:'coop',diff:'easy',
  q:'Each student in a group of four has one job: reader, note-taker, reporter, or timekeeper. The group only succeeds if everyone contributes.',
  options:['Cooperative Learning','Grammar-Translation Method','Direct Method','Audio-Lingual Method'],correct:0,
  explain:'Clear individual roles combined with a shared group goal is a key feature of Cooperative Learning.'},
 {id:'coop-m',method:'coop',diff:'medium',
  q:'Each group member gets a different piece of information about a story. No one has the whole story, so the group must share what each person knows to answer questions together.',
  options:['Cooperative Learning','Audio-Lingual Method','Content-Based Instruction','Grammar-Translation Method'],correct:0,
  explain:'This is a classic "jigsaw" technique used in Cooperative Learning, where every member\'s contribution is needed for the group to succeed.'},
 {id:'coop-a',method:'coop',diff:'advanced',
  q:'What makes an activity "Cooperative Learning" rather than simply "group work"?',
  options:['Students happen to sit together','Structured roles, a shared goal, and individual accountability within the group','The teacher gives no instructions at all','Students compete against each other and only the best student gets a mark'],correct:1,
  explain:'Cooperative Learning specifically requires structure: defined roles, positive interdependence, and each member being individually accountable.'},

 {id:'gtm-e',method:'gtm',diff:'easy',
  q:'Students translate a paragraph from their first language into English, then study a list of grammar rules and complete written exercises. There is little speaking practice.',
  options:['Grammar-Translation Method','Communicative Language Teaching','Direct Method','Project-Based Learning'],correct:0,
  explain:'Translation exercises and explicit grammar rules, with little spoken practice, describe the Grammar-Translation Method.'},
 {id:'gtm-m',method:'gtm',diff:'medium',
  q:'The teacher writes a grammar rule on the board, explains it in the students\' first language, and asks students to translate sentences to practise it. Pronunciation is not a focus of the lesson.',
  options:['Grammar-Translation Method','Task-Based Language Teaching','Flipped Classroom','Communicative Language Teaching'],correct:0,
  explain:'Explaining rules in the first language and practising through translation is a classic Grammar-Translation lesson.'},
 {id:'gtm-a',method:'gtm',diff:'advanced',
  q:'What is a well-known limitation of the Grammar-Translation Method that future teachers should keep in mind?',
  options:['It builds strong reading and grammar knowledge but gives little practice in speaking or listening','It focuses too heavily on real, spontaneous conversation','It never uses the students\' first language','It gives students too little practice in reading and writing'],correct:0,
  explain:'Grammar-Translation builds grammar and reading/writing skills well, but on its own gives students little spoken practice.'},

 {id:'direct-e',method:'direct',diff:'easy',
  q:'The teacher speaks only English in class, uses pictures and gestures instead of translation, and asks students to answer in full English sentences from the first lesson.',
  options:['Direct Method','Grammar-Translation Method','Content-Based Instruction','Flipped Classroom'],correct:0,
  explain:'Using only the target language and avoiding translation is the defining feature of the Direct Method.'},
 {id:'direct-m',method:'direct',diff:'medium',
  q:'A student asks what a word means. Instead of translating, the teacher draws a picture and mimes an action until the student understands, without using the first language at all.',
  options:['Direct Method','Audio-Lingual Method','Cooperative Learning','Grammar-Translation Method'],correct:0,
  explain:'Demonstration instead of translation, kept entirely in the target language, is central to the Direct Method.'},
 {id:'direct-a',method:'direct',diff:'advanced',
  q:'How does the Direct Method usually treat grammar rules?',
  options:['Rules are explained in detail in the first language before any practice','Grammar is learned inductively, through examples and practice in the target language, with little formal rule explanation','Grammar is never taught at all','Students memorise long lists of grammar rules and translate them'],correct:1,
  explain:'The Direct Method favours learning grammar inductively from examples and use, rather than through explicit rule explanation.'},

 {id:'alm-e',method:'alm',diff:'easy',
  q:'Students repeat a dialogue many times after the teacher and practise substitution drills, changing one word in a sentence pattern, until it becomes automatic.',
  options:['Audio-Lingual Method','Problem-Based Learning','Project-Based Learning','Content-Based Instruction'],correct:0,
  explain:'Repetition and pattern drills until a response becomes automatic are the core technique of the Audio-Lingual Method.'},
 {id:'alm-m',method:'alm',diff:'medium',
  q:'The teacher plays a recorded dialogue, and the whole class repeats each line in chorus. Mistakes are corrected immediately so an incorrect habit does not form.',
  options:['Audio-Lingual Method','Content-Based Instruction','Flipped Classroom','Project-Based Learning'],correct:0,
  explain:'Immediate correction and repeated drilling, to build correct language "habits", is typical of the Audio-Lingual Method.'},
 {id:'alm-a',method:'alm',diff:'advanced',
  q:'Which learning theory is the Audio-Lingual Method most closely based on?',
  options:['Behaviourism: language as habits formed through repetition and reinforcement','Constructivism: learners building their own understanding by solving problems','Humanism: learning driven mainly by emotion and personal choice','Connectivism: learning mainly through online networks and social media'],correct:0,
  explain:'The Audio-Lingual Method grew out of behaviourist psychology, treating language learning as habit formation through drilling.'},

 {id:'flip-e',method:'flipped',diff:'easy',
  q:'Students watch a short grammar video at home before class. In class, they do practice exercises and ask the teacher questions about anything that was unclear.',
  options:['Flipped Classroom','Audio-Lingual Method','Grammar-Translation Method','Direct Method'],correct:0,
  explain:'Moving instruction to before class, and using class time for practice, is the core idea of the Flipped Classroom.'},
 {id:'flip-m',method:'flipped',diff:'medium',
  q:'A teacher records a short lecture about reported speech for students to watch as homework. The next day, class time is used entirely for practice activities and individual help, not for the lecture itself.',
  options:['Flipped Classroom','Direct Method','Cooperative Learning','Content-Based Instruction'],correct:0,
  explain:'Recording the input for homework and freeing class time for practice and support is a Flipped Classroom design.'},
 {id:'flip-a',method:'flipped',diff:'advanced',
  q:'What is the main purpose of moving direct instruction outside class time in a Flipped Classroom?',
  options:['To free up class time for practice, discussion and support with the teacher present','To remove the teacher\'s role from the lesson completely','To reduce the total amount of content students see','To make students work alone with no feedback from anyone'],correct:0,
  explain:'The point of flipping is to use limited class time for the things that benefit most from a teacher being present: practice, questions and feedback.'},

 {id:'cbi-e',method:'cbi',diff:'easy',
  q:'Students learn English by studying a science topic, such as the water cycle, with all the reading, discussion and vocabulary work done in English.',
  options:['Content-Based Instruction','Grammar-Translation Method','Audio-Lingual Method','Flipped Classroom'],correct:0,
  explain:'Teaching language through subject content, like science, is exactly what Content-Based Instruction means.'},
 {id:'cbi-m',method:'cbi',diff:'medium',
  q:'An English class is combined with a history topic. Students read history texts in English, discuss the causes of an event, and build academic English vocabulary at the same time.',
  options:['Content-Based Instruction','Problem-Based Learning','Direct Method','Audio-Lingual Method'],correct:0,
  explain:'CBI integrates learning subject content, such as history, with learning the language needed to discuss it.'},
 {id:'cbi-a',method:'cbi',diff:'advanced',
  q:'What is a common challenge for teachers using Content-Based Instruction?',
  options:['Balancing attention between the subject content and the language-learning goals','Avoiding the use of any English at all','Preventing students from learning any new vocabulary','Teaching grammar rules only through translation exercises'],correct:0,
  explain:'A recognised challenge of CBI is keeping both the subject content and the language objectives properly supported, rather than one crowding out the other.'}
];
const MC_BY_DIFF={easy:MC_QUESTIONS.filter(q=>q.diff==='easy'),medium:MC_QUESTIONS.filter(q=>q.diff==='medium'),advanced:MC_QUESTIONS.filter(q=>q.diff==='advanced')};

/* Badges awarded so far (Method Challenge only, in this build). Kept as a
   small registry so later phases can add more without changing the shape. */
/* Every badge below is awarded only at the exact moment its condition is
   met — never for merely opening a page. Awarding happens once, at the
   point in code named in each comment, and is persisted immediately. */
const BADGES={
  'first-step':{icon:'🔍',name:'First Step',desc:'Completed your first 4C task.'},
  'source-checker':{icon:'📚',name:'Source Checker',desc:'Opened the Library source for all six AI statements in one task.'},
  'open-mind':{icon:'🔄',name:'Open Mind',desc:'Changed your opinion during a task and explained your final solution in 15+ words.'},
  'deep-thinker':{icon:'🧠',name:'Deep Thinker',desc:'Received an overall AI feedback level of 4 or 5.'},
  'streak-3':{icon:'🔥',name:'3-Day Streak',desc:'Finished a task on three days in a row.'},
  'team-player':{icon:'🏆',name:'Team Player',desc:'Completed a Team Competition with 2 or more teams.'}
};
/* =====================================================================
   QUESTION BANKS
   topic 'methods'    : recognising ELT methods (the 30 original questions + new ones)
   topic 'situations' : "what should the teacher do?" classroom decisions
   topic 'grammar'    : general English grammar
   Authoring format: the CORRECT option is written first; the builder
   places it at a rotating position, and every game shuffles the options
   again at run time (mcShuffleQ), so the answer is never predictable.
   ===================================================================== */
(function(){
  MC_QUESTIONS.forEach(q=>{q.topic='methods'});
  const counters={me:0,si:0,gr:0};let seq=0;
  const add=(prefix,topic,diff,stem,opts,explain,method)=>{
    const n=String(++counters[prefix]).padStart(3,'0'),pos=(seq++)%4,wrong=opts.slice(1),o=wrong.slice();
    o.splice(pos,0,opts[0]);
    MC_QUESTIONS.push({id:prefix+'-'+n,topic,method:method||'',diff,q:stem,options:o,correct:pos,explain})};
  const M=(m,d,s,o,e)=>add('me','methods',d,s,o,e,m);
  const S=(d,s,o,e)=>add('si','situations',d,s,o,e);
  const G=(d,s,o,e)=>add('gr','grammar',d,s,o,e);

  /* ---------- METHODS (45 new) ---------- */
  M('clt','easy',"Students interview each other about their weekend plans. The teacher cares more that they understand each other than about perfect grammar.",["Communicative Language Teaching","Grammar-Translation Method","Audio-Lingual Method","Lecture Method"],"CLT puts real communication and meaning first.");
  M('clt','easy',"In CLT, the main goal of learning English is to...",["communicate meaning in real situations","memorise grammar rules","translate texts word by word","copy the teacher's pronunciation perfectly"],"CLT aims at communicative ability, not only knowledge about the language.");
  M('clt','medium',"The teacher gives pairs a bus timetable with missing information. Each student has different information and must ask questions to complete it.",["Communicative Language Teaching (information gap)","Audio-Lingual Method","Flipped Classroom","Grammar-Translation Method"],"An information gap creates a real need to communicate.");
  M('clt','medium',"Which activity is MOST typical of CLT?",["A role-play about booking a hotel room","Repeating a dialogue ten times in chorus","Translating a paragraph into English","Filling in a grammar table alone"],"Role-play uses language for a purpose, in a realistic situation.");
  M('clt','advanced',"A CLT teacher hears many grammar mistakes in a discussion. Which reason best explains why she waits before correcting?",["Interrupting can reduce fluency and confidence, so feedback can come after the activity","Grammar is not important in CLT at all","Students never learn from correction","Correction is forbidden by school rules"],"CLT does not ignore accuracy. Timing of feedback protects communication.");
  M('tblt','easy',"Students must plan a class trip: choose a place, compare prices, and present the plan. The teacher gives language help after they finish.",["Task-Based Language Teaching","Audio-Lingual Method","Grammar-Translation Method","Direct Method"],"A real task with an outcome comes first, and language focus follows.");
  M('tblt','medium',"In TBLT, what is a 'task'?",["An activity with a real outcome where language is a tool","A grammar exercise with one correct answer","A list of new words for homework","A test at the end of the unit"],"The outcome (a plan, a decision, a list) drives the language use.");
  M('tblt','medium',"The three phases of a typical task-based lesson are...",["pre-task, task, and language focus","warm-up, drill, and test","lecture, quiz, and homework","translate, memorise, and recite"],"Pre-task prepares, the task is done, then language is reviewed.");
  M('tblt','advanced',"A teacher asks students to write a real email to a company asking for information, then reflect on useful phrases. Why is this task-based?",["The goal is a real outcome, and language is chosen to achieve it","It uses the past tense","It is written","It has a time limit"],"In TBLT, language serves a non-linguistic outcome.");
  M('pbl','easy',"Students spend a month making a class magazine in English and sell it at a school event.",["Project-Based Learning","Audio-Lingual Method","Grammar-Translation Method","Direct Method"],"A long activity with a real product and audience is typical of project work.");
  M('pbl','medium',"Which is a key feature of Project-Based Learning?",["A final product shared with an audience","Only listening exercises","Silent individual drills","A single test question"],"The product and audience give the work purpose.");
  M('pbl','medium',"A class makes a short video guide to their university for new students, working in groups over three weeks. Why is this Project-Based Learning?",["Long-term group work leads to a real product for an audience","Students translate from Uzbek","The teacher lectures the whole time","There are no groups"],"Time, product and audience define a project.");
  M('pbl','advanced',"A risk of Project-Based Learning in a language class is that...",["students may use their first language a lot unless English use is planned","there is never any speaking","it cannot include writing","it needs no planning"],"Teachers must plan how English will be used during the project.");
  M('prbl','easy',"Students read a case: 'A new student cannot find the library and is too shy to ask.' Groups discuss what to do and present solutions.",["Problem-Based Learning","Grammar-Translation Method","Audio-Lingual Method","Lecture Method"],"Learning starts from a real problem that students try to solve.");
  M('prbl','medium',"How does Problem-Based Learning usually start?",["With a real problem for students to investigate","With a long grammar lecture","With a vocabulary test","With memorising a dialogue"],"The problem comes first, and knowledge is built while solving it.");
  M('prbl','medium',"The teacher's role in Problem-Based Learning is mainly to...",["guide with questions and support","dictate every answer","leave the room","translate everything"],"The teacher facilitates while students investigate.");
  M('prbl','advanced',"What usually distinguishes Problem-Based Learning from Task-Based Learning?",["PrBL centres on investigating and solving a problem, while TBLT centres on completing a communicative task","There is no difference at all","TBLT uses only grammar drills","PrBL never uses group work"],"Both are learner-centred, but the starting point and focus differ.");
  M('coop','easy',"Students in groups of four each get a role: leader, writer, checker, speaker. The group gets one shared mark.",["Cooperative Learning","Grammar-Translation Method","Direct Method","Audio-Lingual Method"],"Clear roles and a shared goal are typical of cooperative learning.");
  M('coop','easy',"Think-Pair-Share means students...",["think alone, discuss with a partner, then share with the class","listen to the teacher only","take a written test","translate a text"],"It is a simple cooperative structure.");
  M('coop','medium',"What does 'positive interdependence' mean in Cooperative Learning?",["Group members need each other to succeed","Students compete against each other","The best student works alone","The teacher decides everything"],"Success depends on everyone's contribution.");
  M('coop','medium',"Why is individual accountability important in Cooperative Learning?",["Every member must learn and contribute","So the teacher can punish students","So groups become larger","So nobody has to speak"],"Without it, one student may do all the work.");
  M('coop','advanced',"In a group project, one student does all the work while others copy. Which change best supports cooperative learning?",["Give each member a role and a part that must be reported individually","Remove groups completely","Give everyone the same mark without checking","Let the strongest student decide"],"Roles and individual reporting create real accountability.");
  M('gtm','easy',"The teacher explains the past perfect in Uzbek, writes rules on the board, and students translate ten sentences.",["Grammar-Translation Method","Communicative Language Teaching","Direct Method","Task-Based Language Teaching"],"Rules in the first language plus translation are typical of GTM.");
  M('gtm','medium',"Which skill is usually LEAST developed by the Grammar-Translation Method?",["Speaking and listening","Reading literary texts","Grammar knowledge","Vocabulary lists"],"GTM focuses on written language and rules.");
  M('gtm','medium',"In GTM, the main language of instruction is usually...",["the students' first language","only English","only gestures","only pictures"],"Explanations and translation use the first language.");
  M('gtm','advanced',"Why do some teachers still use short translation activities today?",["To check understanding and compare structures between languages, in small amounts","Because translation is the only good method","To avoid speaking","Because translation replaces all practice"],"A small amount of translation can be useful without being the whole method.");
  M('direct','easy',"The teacher never uses Uzbek. She shows a picture of an apple, says 'apple', and asks 'What is this?'",["Direct Method","Grammar-Translation Method","Flipped Classroom","Content-Based Instruction"],"No translation, and meaning is shown directly.");
  M('direct','medium',"In the Direct Method, meaning is usually shown by...",["pictures, objects and actions","translation lists","grammar tables","reading aloud only"],"The target language is linked directly to meaning.");
  M('direct','medium',"What is a difficulty of the Direct Method for beginners?",["Explaining abstract words without translation can be hard","There are no textbooks","Students cannot hear English","It uses only writing"],"Without translation, abstract meanings take more effort.");
  M('direct','advanced',"Which pair is correctly matched?",["Direct Method – no translation in class","Direct Method – heavy grammar rules first","Direct Method – silent classes","Direct Method – reading only"],"Avoiding the first language is the core idea.");
  M('alm','easy',"Students repeat 'Where is the pen? It is on the table.' and then replace 'pen' with 'book' and 'table' with 'desk' in drills.",["Audio-Lingual Method","Problem-Based Learning","Project-Based Learning","Content-Based Instruction"],"Repetition and substitution drills are typical of ALM.");
  M('alm','medium',"The Audio-Lingual Method believes language learning is mostly...",["habit formation through repetition","problem solving","project work","translation"],"ALM grew from behaviourist ideas.");
  M('alm','medium',"Which activity is most typical of ALM?",["Substitution drills","Debates","Group projects","Case studies"],"Drills build patterns until they are automatic.");
  M('alm','advanced',"A common criticism of ALM is that students may...",["perform drills well but struggle to use the language creatively","never learn any words","be unable to repeat sentences","never hear English"],"Pattern practice does not always transfer to real conversation.");
  M('flipped','easy',"Students watch a six-minute video about 'used to' at home. In class, they use it in speaking practice.",["Flipped Classroom","Audio-Lingual Method","Grammar-Translation Method","Direct Method"],"Input at home, practice in class.");
  M('flipped','medium',"In a flipped classroom, class time is best used for...",["practice, discussion and help from the teacher","the first explanation of everything","silent copying","only tests"],"The teacher's time is used for interaction and support.");
  M('flipped','medium',"Some students did not watch the homework video. What is a sensible response?",["Start with a quick check task or short recap and support those students","Cancel the method for ever","Give the whole lecture again to everyone","Punish the whole class"],"Plan for missing preparation instead of abandoning the method.");
  M('flipped','advanced',"Which issue should a teacher consider before assigning video homework?",["Whether all students have devices and internet at home","The colour of the slides","The teacher's handwriting","Whether videos are long enough to be boring"],"Equal access is a basic condition.");
  M('cbi','easy',"In a lesson about renewable energy, students read and discuss the topic in English and learn the key vocabulary.",["Content-Based Instruction","Grammar-Translation Method","Audio-Lingual Method","Direct Method"],"Language is learned through subject content.");
  M('cbi','medium',"What is the main aim of Content-Based Instruction?",["Learn language while learning subject content","Only memorise grammar","Only translate texts","Avoid using English"],"Content and language are learned together.");
  M('cbi','medium',"Which class is closest to CBI?",["A geography lesson taught in English to language learners","A grammar drill","A translation exam","A phonics chart"],"Subject teaching in English with language support.");
  M('cbi','advanced',"A CBI teacher plans a history unit. Which is a good language objective?",["Students can use past tenses and time expressions to describe causes and results","Students memorise dates only","Students copy the textbook","Students learn all history terms in Uzbek"],"Language objectives support the content objectives.");
  M('mixed','easy',"Which method uses the students' first language MOST?",["Grammar-Translation Method","Direct Method","Task-Based Language Teaching","Communicative Language Teaching"],"GTM explains and practises through the first language.");
  M('mixed','medium',"Which two approaches both put communication ahead of drills?",["Communicative Language Teaching and Task-Based Language Teaching","Audio-Lingual Method and Grammar-Translation Method","Grammar-Translation Method and Lecture Method","Audio-Lingual Method and Direct Method"],"CLT and TBLT are both communicative approaches.");
  M('mixed','medium',"Which method treats mistakes as bad habits to prevent immediately?",["Audio-Lingual Method","Communicative Language Teaching","Project-Based Learning","Task-Based Language Teaching"],"ALM stresses accuracy through repetition and immediate correction.");

  /* ---------- CLASSROOM SITUATIONS (36) ---------- */
  S('easy',"Two students finish an activity early while others are still working. What is the best action?",["Give them a short extension task on the same topic","Tell them to sit quietly","Ask them to clean the board","Collect all the work immediately"],"Extension tasks keep fast finishers learning without stopping others.");
  S('easy',"A student asks the meaning of a word during a listening task while the recording is still playing. What is best?",["Ask them to note it and discuss it after listening","Stop the audio and explain","Ignore the student for ever","Translate the whole recording"],"Interrupting the task breaks concentration. Deal with the word afterwards.");
  S('easy',"You want quiet students to speak more. Which is the best first step?",["Give thinking time and let them talk in pairs before the whole class","Call on them suddenly and demand a full answer","Lower their marks when they are silent","Ask only the confident students"],"Rehearsal in pairs makes speaking safer.");
  S('easy',"Students keep using Uzbek in pair work. What should you try first?",["Check that the task is clear and possible in English, give useful phrases, and monitor","Punish every Uzbek word","Stop pair work for ever","Speak only Uzbek yourself"],"Often the task is too difficult or unclear. Support makes English use easier.");
  S('easy',"How can you check that students understood the instructions?",["Ask short questions such as 'How many minutes? Who speaks first?'","Ask 'Do you understand?'","Repeat the instructions louder","Start without instructions"],"Concept-checking questions show real understanding.");
  S('easy',"A student makes a small grammar mistake during a fluency activity. What is a good approach?",["Note it and give delayed feedback after the activity","Stop and correct in front of everyone every time","Laugh and repeat it","Ignore all mistakes for the whole year"],"Delayed feedback protects fluency.");
  S('easy',"Which is the best way to introduce the word 'crowded'?",["Show a picture and give an example sentence","Write only the Uzbek translation","Give a long grammar explanation","Ask students to guess with no help"],"A picture and an example give meaning and use.");
  S('easy',"Before a reading task you want students to be ready. What can you do?",["Ask them to predict the content from the title and a picture","Give them the answer key","Tell them to read silently with no purpose","Read the whole text yourself first"],"Prediction activates knowledge and gives a purpose for reading.");
  S('easy',"You have 20 minutes left and a 30-minute activity. What is best?",["Shorten the activity to the key part and keep the objective","Ignore the lesson objective","Continue and say nothing about the time","Cancel the class"],"Adapt the plan and keep the main learning goal.");
  S('easy',"A student says 'I don't understand this at all.' What should you do?",["Ask which part is unclear and give a simpler example","Tell them to try harder","Skip them","Repeat the same explanation louder"],"Find the problem first, then simplify.");
  S('easy',"How can pair work be organised in a class of 32 with fixed desks?",["Students turn to the person next to or behind them","Cancel pair work","Move all the desks every time","Choose only four students"],"Simple pairing works even with fixed desks.");
  S('easy',"What is the best purpose for a warm-up activity?",["Activate students' minds and prepare for the topic","Test the students strictly","Fill time with silence","Introduce the exam"],"A warm-up gets students ready to learn.");
  S('medium',"Half the class finds a text too easy and half too hard. Which approach helps most?",["Use the same text with tasks at different levels","Give the hard text to everyone","Give the easy text to everyone","Skip reading"],"Tiered tasks let everyone work on the same text.");
  S('medium',"A student is fluent but makes many tense errors. What feedback is best after the activity?",["Show two or three anonymous examples and ask the class to correct them","Give a long lecture on all tenses","Mark them down heavily","Say nothing"],"Anonymous examples are safe and focus on real errors.");
  S('medium',"Which is most useful for assessing speaking fairly?",["A rubric with clear criteria such as fluency, accuracy and range","A feeling about who is 'good'","Only pronunciation","A written vocabulary test only"],"Criteria make assessment more consistent and explainable.");
  S('medium',"Students are unmotivated in a compulsory English class. Which is a good step?",["Connect tasks to their interests and goals, with small successes","Increase homework as punishment","Tell them English is easy","Reduce speaking"],"Relevance and success build motivation.");
  S('medium',"A student copies homework from a classmate. What is the most educational response?",["Talk privately, explain expectations, and design tasks that need personal input","Shame the student publicly","Ignore it","Cancel homework for ever"],"Address the cause and improve the task design.");
  S('medium',"The same three students answer every question. What can you change?",["Use pair discussion and choose different students after thinking time","Ask only those three","Stop asking questions","Ask only volunteers"],"Structure gives everyone a chance.");
  S('medium',"During group work one group is off-task. What should you do first?",["Go to the group, ask about their progress, and refocus them on the task","Shout across the room","Remove the group","End the activity"],"Quiet intervention respects the students and the class.");
  S('medium',"Which lesson order is most logical?",["Lead-in, presentation, practice, production, feedback","Test, lecture, lecture, test","Homework, break, break","Production before any input for beginners"],"Learners need input and practice before free production.");
  S('medium',"How can you teach a grammar structure communicatively?",["Show it in a meaningful context, practise with an information gap, then give feedback","Only list the rules","Only translate sentences","Only test it"],"Meaning, use and feedback belong together.");
  S('medium',"A parent asks why you do not correct every speaking mistake. What is a sound answer?",["Constant correction can block fluency, so I focus on important errors and give feedback later","I do not care about grammar","Correction is illegal","My students never make mistakes"],"It explains a principled choice.");
  S('medium',"Which support is most useful in a mixed-ability writing task?",["Sentence frames for weaker students and an extension prompt for stronger students","The same task and no support","Only an advanced task","No task"],"Support and extension let everyone succeed.");
  S('medium',"What is the best way to give instructions for a complicated activity?",["Break them into steps, demonstrate with an example, and check understanding","Give them all at once, quickly","Give them only in writing without checking","Let students guess"],"Clear steps and a demonstration reduce confusion.");
  S('advanced',"A teacher uses AI to produce a reading text but does not check it. What is the main risk?",["The text may contain errors, a wrong level or unsuitable content that nobody noticed","AI texts are always perfect","Students will read too much","There is no risk"],"The teacher remains responsible for the quality of materials.");
  S('advanced',"You must choose between covering the whole syllabus and deeper speaking practice. What is the most balanced decision?",["Prioritise objectives, cut low-value exercises, and keep meaningful speaking practice","Cover everything as fast as possible","Ignore the syllabus completely","Ignore objectives"],"Decisions should follow learning objectives.");
  S('advanced',"What is the strongest reason to use formative assessment during a unit?",["It gives information to adjust teaching while learning is still happening","It replaces the final exam","It only produces marks","It is easier to grade"],"Formative assessment improves teaching and learning in time.");
  S('advanced',"One student is fluent but inaccurate. Another is accurate but very slow. What does this mean for feedback?",["They need different feedback targets: accuracy work for the first, fluency practice for the second","Both need the same feedback","Neither needs feedback","Only accuracy matters"],"Feedback should match each learner's needs.");
  S('advanced',"Which use of the first language (Uzbek) can be pedagogically justified?",["Briefly clarifying an abstract concept or giving complex instructions to beginners","Teaching the whole lesson in Uzbek","Punishing all use of English","Replacing all English speaking"],"Limited, purposeful use can help learning.");
  S('advanced',"You want to reduce teacher talking time. Which change is most effective?",["Use pair or group tasks and short, clear instructions","Talk more to explain everything","Read the textbook aloud","Speak faster"],"More student activity means less teacher talk.");
  S('advanced',"How can you make sure a listening task is not just a test?",["Teach strategies: predict, listen for gist, then detail, and discuss","Play it once with no purpose","Give only a mark","Skip listening"],"Strategy teaching builds listening ability.");
  S('advanced',"A class does very badly in a test. What should a reflective teacher do first?",["Analyse which items were missed and why, then adjust teaching","Blame the students","Cancel the test","Lower the pass mark without checking"],"Analysis comes before action.");
  S('advanced',"Which is an ethical concern when AI is used to grade student writing?",["Fairness, privacy of student text, and loss of teacher judgement","AI is too fast","Students like it","It is free"],"Ethical use protects fairness and privacy.");
  S('advanced',"A colleague says: 'Students learn best when taught in their preferred learning style.' What should you do?",["Check reliable research reviews before changing your teaching","Accept it immediately","Ignore all colleagues","Ask students to take a quiz and stop planning"],"Claims should be checked before they change practice.");
  S('advanced',"Which is the best reason to use authentic materials with B1 students?",["They show real language use, if supported with suitable tasks","They are always easy","They replace teaching","They are always shorter"],"Authentic input is valuable when the task is graded.");
  S('advanced',"You have 40 students and little time. Which approach can still promote speaking?",["Structured pair work and short group tasks with clear roles","An individual oral exam for everyone every lesson","Only choral repetition","No speaking at all"],"Structure makes speaking possible in large classes.");

  /* ---------- GRAMMAR (45) ---------- */
  G('easy',"She ___ to school every day.",["goes","go","going","gone"],"Third person singular in the present simple takes -s or -es.");
  G('easy',"There ___ two books on the table.",["are","is","am","be"],"Plural noun, so 'are'.");
  G('easy',"I have ___ apple and ___ orange.",["an / an","a / a","an / a","a / an"],"Use 'an' before a vowel sound.");
  G('easy',"He is ___ than his brother.",["taller","tall","tallest","more tall"],"Short adjectives take -er in the comparative.");
  G('easy',"We are ___ TV now.",["watching","watch","watches","watched"],"Present continuous: be + verb-ing.");
  G('easy',"My birthday is ___ May.",["in","at","on","by"],"Months take 'in'.");
  G('easy',"There isn't ___ milk in the fridge.",["much","many","few","a few"],"'Milk' is uncountable, so use 'much'.");
  G('easy',"Yesterday I ___ a film.",["saw","see","seen","seeing"],"Past simple of 'see' is 'saw'.");
  G('easy',"___ you like some tea?",["Would","Do","Are","Can"],"'Would you like...?' is the polite offer.");
  G('easy',"These are my ___.",["children","child","childs","childrens"],"'Child' has an irregular plural: 'children'.");
  G('easy',"They ___ students.",["are","is","am","be"],"'They' takes 'are'.");
  G('easy',"I'm interested ___ music.",["in","on","at","for"],"'Interested in' is the fixed pattern.");
  G('easy',"She can ___ very well.",["swim","swims","swimming","to swim"],"After a modal verb use the base form.");
  G('easy',"___ is your name?",["What","Who","Where","When"],"We ask for a name with 'What'.");
  G('easy',"My brother is the ___ in our family.",["tallest","tall","taller","most tall"],"Superlative of a short adjective: -est.");
  G('medium',"I ___ here since 2020.",["have lived","live","lived","am living"],"'Since' + a time point needs the present perfect.");
  G('medium',"If it rains tomorrow, we ___ at home.",["will stay","stay","would stay","stayed"],"First conditional: if + present, will + verb.");
  G('medium',"The letter ___ yesterday.",["was written","wrote","is written","has written"],"Past passive: was/were + past participle.");
  G('medium',"You ___ smoke here. It is forbidden.",["mustn't","don't have to","needn't","may"],"'Mustn't' expresses prohibition.");
  G('medium',"I enjoy ___ English.",["studying","to study","study","studied"],"'Enjoy' is followed by the -ing form.");
  G('medium',"The man ___ lives next door is a doctor.",["who","which","whose","whom"],"'Who' refers to a person as the subject.");
  G('medium',"I'm looking forward to ___ you.",["seeing","see","saw","seen"],"'To' here is a preposition, so use -ing.");
  G('medium',"We ___ dinner when the phone rang.",["were having","had","have","are having"],"Past continuous for an action in progress when another happened.");
  G('medium',"He is good ___ mathematics.",["at","in","on","for"],"'Good at' is the fixed pattern.");
  G('medium',"If I ___ you, I would study more.",["were","am","was","be"],"Second conditional in standard usage: 'if I were you'.");
  G('medium',"How ___ people came to the party?",["many","much","few","little"],"'People' is countable, so use 'many'.");
  G('medium',"She has lived here ___ ten years.",["for","since","from","during"],"'For' + a length of time.");
  G('medium',"This is the house ___ I was born.",["where","which","who","whom"],"'Where' refers to a place.");
  G('medium',"I didn't go out because it ___ heavily.",["was raining","rained","has rained","rains"],"Past continuous describes the situation at that time.");
  G('medium',"By the time we arrived, the film ___.",["had already started","already started","has already started","was already starting"],"Past perfect for an earlier past event.");
  G('advanced',"If she had studied harder, she ___ the exam.",["would have passed","would pass","will pass","passed"],"Third conditional: if + past perfect, would have + past participle.");
  G('advanced',"I wish I ___ more time yesterday.",["had had","have","had","would have"],"A wish about the past uses the past perfect.");
  G('advanced',"Not only ___ late, but he also forgot the tickets.",["was he","he was","he is","is he"],"Inversion follows 'not only' at the start of a clause.");
  G('advanced',"He suggested that she ___ a doctor.",["should see","sees","saw","is seeing"],"After 'suggest that' use 'should' + verb or the base form.");
  G('advanced',"She is said ___ five languages.",["to speak","speaking","speak","that speaks"],"Passive reporting structure: is said to + infinitive.");
  G('advanced',"By next June, I ___ here for ten years.",["will have been working","will work","work","have worked"],"Future perfect continuous for duration up to a future time.");
  G('advanced',"The report needs ___ before Friday.",["finishing","to finish","finished","being finish"],"'Need' + -ing has a passive meaning: needs finishing.");
  G('advanced',"Hardly ___ the room when the alarm went off.",["had I entered","I had entered","I entered","did I enter"],"Inversion after 'hardly' with the past perfect.");
  G('advanced',"It's high time we ___ the problem.",["solved","solve","will solve","have solving"],"'It's high time' is followed by the past simple.");
  G('advanced',"She would rather you ___ me the truth.",["told","tell","will tell","telling"],"'Would rather' + subject + past simple.");
  G('advanced',"___ the weather, we went for a walk.",["Despite","Despite of","In spite","Although"],"'Despite' is followed directly by a noun phrase.");
  G('advanced',"Had I known about the delay, I ___ earlier.",["would have left","would leave","will leave","left"],"Inverted third conditional.");
  G('advanced',"The book, ___ cover is red, is mine.",["whose","who","which","that"],"'Whose' shows possession.");
  G('advanced',"He denied ___ the window.",["breaking","to break","break","to have break"],"'Deny' is followed by the -ing form.");
  G('advanced',"Neither of the students ___ the answer.",["knows","know","are knowing","have known"],"In standard usage 'neither' takes a singular verb.");
})();

/* Draw questions so that a student does not see the same one again until the whole pool has been used. */
function qPool(topics,diff){return MC_QUESTIONS.filter(q=>topics.includes(q.topic)&&(!diff||diff==='mixed'||q.diff===diff))}
function pickQs(pool,n){
  const seen=S.seenQ||(S.seenQ={});let fresh=pool.filter(q=>!seen[q.id]);
  let chosen=shuffle(fresh).slice(0,n);
  if(chosen.length<n){                 /* pool exhausted: start a new cycle for this pool */
    pool.forEach(q=>{delete seen[q.id]});
    const ids=new Set(chosen.map(q=>q.id));
    chosen=chosen.concat(shuffle(pool.filter(q=>!ids.has(q.id))).slice(0,n-chosen.length))}
  chosen.forEach(q=>{seen[q.id]=1});
  const keys=Object.keys(seen);if(keys.length>800)keys.slice(0,keys.length-800).forEach(k=>delete seen[k]);
  persist();return chosen}
/* Uzbek (Latin) text of the app: SHORT supportive explanations only. English is the main interface language.
   Written with ASCII apostrophes inside double-quoted strings; build_site.py converts them to the correct marks:
   o' and g'  ->  oʻ gʻ  (U+02BB),  any other apostrophe between letters -> ʼ  (U+02BC). */
const UZ={
 home:{support:"Boʻlajak ingliz tili oʻqituvchilari uchun sunʼiy intellekt va tanqidiy fikrlash.",
  whatSupport:"Platforma AI javoblarini tahlil qilish va tekshirishni oʻrgatadi."},
 stage:[
  {t:"Vaziyatni oʻqing, asosiy muammoni tanlang va oʻz fikringizni yozing."},
  {t:"AI taklifini diqqat bilan oʻqing: uning bir qismi toʻgʻri, bir qismi notoʻgʻri."},
  {t:"AI bilan rozimisiz? Sababini yozing va har bir gapni manbalar bilan tekshiring."},
  {t:"Yakuniy yechimingizni yozing va birinchi fikringiz bilan solishtiring."}],
 q:{problem:"Asosiy muammo nima?",initial:"Nima qilgan boʻlardingiz va nega? Bu sizning birinchi fikringiz.",
  agree:"AI taklifiga qoʻshilasizmi?",why:"Nega? Fikringizni tushuntiring.",source:"Tashqi manbani tekshirish kerakmi? \"Yes\" bossangiz, har bir gapning ilmiy manbasi ochiladi.",
  final:"Yakuniy yechimingiz qanday va nega?",diff:"Birinchi fikringizdan nimasi bilan farq qiladi?"},
 crit:{analysis:"Muammoni tahlil qilish",evaluation:"AI gaplarini baholash",inference:"Dalillardan xulosa chiqarish",explanation:"Yechimni asoslash",self:"Oʻz fikrini qayta koʻrib chiqish"},
 consultNote:"Bu yerda javob toʻgʻrimi yoki yoʻqmi aytilmaydi. Buni keyingi qadamda manbalar orqali oʻzingiz aniqlaysiz.",
 evalNote:"AI boshidagi va oxiridagi fikringizni solishtirib, tanqidiy fikrlashingizni 1 dan 5 gacha baholaydi.",
 cycleLead:"Har bir topshiriq toʻrt qadamdan iborat: oʻylash, AIʼdan soʻrash, tekshirish va qaror qilish.",
 tasksLead:"Barcha 100 ta vaziyat Oʻzbekiston maktablari, litseylari, oʻquv markazlari va oliygohlaridan olingan.",
 sourcesLead:"Bu yerda platformadagi har bir AI gapini tekshirish uchun ishlatilgan chop etilgan ilmiy manbalar toʻplangan.",
 chat:{ask:"Kuzatuv savoli bering",page:"Istalgan savolingizni yozing.",
  ex:["Men ingliz tilini oʻrganishda qiynalayapman. Speakingimni qanday yaxshilashim mumkin?","Present Perfect va Past Simple oʻrtasidagi farqni tushuntirib ber."]},
 /* ---- About page, Uzbek tab (optional) ---- */
 aboutTitle:"Loyiha haqida",aboutLead:"Sunʼiy intellekt bilan tuzilgan oʻzaro taʼsir orqali tanqidiy fikrlashni rivojlantiruvchi elektron metodik prototip.",
 institution:"MUASSASA",dissLabel:"Dissertatsiya mavzusi",
 dissertation:"Sunʼiy intellekt vositalari asosida boʻlajak ingliz tili oʻqituvchilarining tanqidiy fikrlash koʻnikmalarini rivojlantirish metodikasi",
 cols:["Qadam","Talaba nima qiladi","Qisqacha"],
 cycleNote:"Toʻrt qadam, har doim shu tartibda: Contextualize (Think), Consult (Ask AI), Critique (Check), Construct (Decide).",
 about:[
  {h:"AI-CT TEACHER nima?",p:["AI-CT TEACHER boʻlajak ingliz tili oʻqituvchilarining tanqidiy fikrlashini sunʼiy intellekt bilan tuzilgan oʻzaro taʼsir orqali rivojlantirishga moʻljallangan elektron metodik prototip.","Platforma AI javobini tanqidiy tahlil obʼekti sifatida koʻradi: talaba avval oʻzi oʻylaydi, AI taklifini oʻqiydi, har bir gapni ilmiy manbalar bilan tekshiradi va oʻz qarorini yozadi."]},
  {h:"AI-CT 4C sikli",p:[],table:true},
  {h:"Manbalar kutubxonasi (Source Library)",p:["Har bir AI taklifidagi har bir gap chop etilgan ilmiy manbaga bogʻlangan: metod yoki nazariya, muallif, yil va asar. Talaba Check qadamida va Source Library sahifasida bu manbalarni ochib oʻqiydi. Tadqiqotda foydalanishdan oldin roʻyxatni asl asarlar bilan solishtirish kerak."]},
  {h:"AI qanday ishlatiladi?",p:["Har bir topshiriqdagi AI taklifi oldindan, AI javoblariga xos uslubda tayyorlangan, shuning uchun uning har bir gapini manba bilan tekshirish mumkin. Gemini xavfsiz server orqali vazifa oxiridagi baholashda va alohida AI Chat sahifasida ishlatiladi. API kaliti serverda saqlanadi, talaba hech qachon kalit kiritmaydi."]},
  {h:"Baholash",p:["Vazifa oxirida Gemini talabaning birinchi fikri, sabablari va yakuniy yechimini solishtiradi hamda besh mezon boʻyicha (tahlil, baholash, xulosa chiqarish, asoslash, oʻz fikrini nazorat qilish; Facione, 1990) 1 dan 5 gacha daraja va qisqa xulosa beradi. AI ishlamasa, ilova aniq belgilangan avtomatik baho koʻrsatadi.","Bu oʻquv vositasi, tasdiqlangan psixologik test emas."]},
  {h:"Maʼlumotlar",p:["Natijalar, XP, nishonlar va javoblaringiz faqat shu qurilmaning brauzerida saqlanadi. Yozuvlarni JSON yoki CSV koʻrinishida yuklab olish mumkin. AI baholashi uchun javoblaringiz matni faqat shu soʻrov uchun serverga yuboriladi."]},
  {h:"Tadqiqotda foydalanish va cheklovlar",p:["Bu tadqiqot prototipi boʻlib, biror muassasaning rasmiy mahsuloti emas. Tadqiqotda yozuvlarni oʻqitilgan baholovchilar ham baholashi kerak; ilmiy asoslilik dasturdan emas, tadqiqot dizaynidan keladi."]}]
};
/* =====================================================================
   SOUND — short Web Audio beeps only. No audio files, no autoplay music.
   Browsers block sound until the visitor first taps, clicks or presses a
   key, so the welcome chime plays on that first interaction. After that,
   sound plays in response to actions, and only while the ON/OFF toggle
   (persisted like the theme preference) is on. Default: on.
   ===================================================================== */
const SND={ctx:null};
const sndEnabled=()=>S.prefs.sound!==false;
function sndCtx(){
  if(!SND.ctx){try{SND.ctx=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}
  if(SND.ctx.state==='suspended')SND.ctx.resume().catch(()=>{});
  return SND.ctx}
function beep(freq,dur,delay=0,gain=0.07,type='sine'){
  const ctx=sndCtx();if(!ctx)return;
  const t0=ctx.currentTime+delay,osc=ctx.createOscillator(),g=ctx.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,t0);
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(gain,t0+0.012);g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  osc.connect(g);g.connect(ctx.destination);osc.start(t0);osc.stop(t0+dur+0.03)}
function sndPlay(name){
  if(!sndEnabled())return;
  switch(name){
    case 'correct':beep(880,.12);beep(1180,.14,.09);break;
    case 'wrong':beep(280,.22,0,.06,'triangle');break;
    case 'start':beep(520,.1);beep(660,.12,.11);beep(880,.18,.22);break;
    case 'achievement':beep(660,.1);beep(880,.1,.1,.08);beep(1108,.24,.2,.09);break;
    case 'complete':beep(784,.14);beep(988,.14,.12,.08);beep(1318,.3,.24,.09);break;
    case 'welcome':beep(392,.18,0,.05);beep(523,.18,.14,.05);beep(659,.2,.28,.055);beep(784,.42,.44,.06);beep(1046,.5,.62,.04);break;
    case 'stage':beep(740,.09,0,.05);beep(988,.16,.08,.055);break;
    /* Team Competition: little jingles. Correct = bright rising fanfare; wrong = soft falling "aww"; time up = three falling beeps. */
    case 'tc-correct':[523,659,784,1046].forEach((f,i)=>beep(f,.16,i*.085,.075,'triangle'));[1046,1318,1568].forEach(f=>beep(f,.7,.36,.05,'sine'));beep(2093,.5,.42,.025,'sine');break;
    case 'tc-wrong':[392,349,311,262].forEach((f,i)=>beep(f,.24,i*.17,.07,'triangle'));beep(131,.7,.6,.07,'sawtooth');break;
    case 'tc-timeup':beep(660,.13,0,.07,'square');beep(520,.13,.17,.07,'square');beep(390,.34,.34,.07,'square');break;
    case 'tc-turn':beep(587,.09,0,.05,'triangle');beep(784,.15,.09,.055,'triangle');break;
    case 'ai':beep(330,.07,0,.04,'triangle');beep(494,.07,.07,.04,'triangle');beep(659,.12,.14,.045,'triangle');break;
  }}
function sndToggleBtn(){return `<button class="sound-toggle" data-act="snd-toggle" aria-pressed="${sndEnabled()}">${sndEnabled()?'🔊':'🔈'} Sound ${sndEnabled()?'on':'off'}</button>`}
/* =====================================================================
   STATE — everything is stored in this browser's localStorage and is
   validated on load, so corrupted or old data can never crash the app.
   Nothing here is sent anywhere: progress, XP, badges and written answers stay on this device.
   ===================================================================== */
const KEY='aict-teacher:prototype:v1', SCHEMA=3;   /* 3 = the 4C cycle; records from the older 6C version are kept on the device but not shown */
let storageOk=true, persistT=null, lastSaved=null;

function defaultState(){return{schema:SCHEMA,attempts:{},order:[],notes:{},prefs:{},xp:0,badges:[],competitions:[],methodRounds:[],
  seenQ:{},streak:{last:'',count:0},profile:{name:'',id:''},legacy:0}}
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const arr=v=>Array.isArray(v)?v:[];
function validAttempt(a){
  try{return isObj(a)&&typeof a.id==='string'&&TASK_BY_ID[a.taskId]&&isObj(a.d)&&['think','consult','check','decide'].every(k=>isObj(a.d[k]))
    &&Number.isInteger(a.stage)&&a.stage>=1&&a.stage<=4&&(a.status==='in_progress'||a.status==='completed')&&isObj(a.d.check.opened)}catch(e){return false}}
function sanitizeState(raw){
  const d=defaultState();
  if(!isObj(raw))return d;
  d.prefs=isObj(raw.prefs)?raw.prefs:{};
  d.xp=Number.isFinite(raw.xp)?Math.max(0,Math.floor(raw.xp)):0;
  d.badges=arr(raw.badges).filter(x=>typeof x==='string');
  d.competitions=arr(raw.competitions).filter(isObj).slice(-200);
  d.methodRounds=arr(raw.methodRounds).filter(isObj).slice(-300);
  d.seenQ=isObj(raw.seenQ)?raw.seenQ:{};
  const st=isObj(raw.streak)?raw.streak:{};d.streak={last:typeof st.last==='string'?st.last:'',count:Number.isFinite(st.count)?st.count:0};
  const pr=isObj(raw.profile)?raw.profile:{};d.profile={name:typeof pr.name==='string'?pr.name.slice(0,40):'',id:typeof pr.id==='string'?pr.id.slice(0,40):''};
  if(raw.schema===SCHEMA){
    const at=isObj(raw.attempts)?raw.attempts:{};
    Object.keys(at).forEach(id=>{if(validAttempt(at[id])){const x=at[id];x.evalBusy=false;d.attempts[id]=x}});
    d.order=arr(raw.order).filter(id=>d.attempts[id]);
    d.notes=isObj(raw.notes)?raw.notes:{}}
  else d.legacy=Object.keys(isObj(raw.attempts)?raw.attempts:{}).length;   // older version: its task records are not shown, only counted
  return d}
function loadState(){try{const raw=localStorage.getItem(KEY);return sanitizeState(raw?JSON.parse(raw):null)}catch(e){storageOk=false;return defaultState()}}
let S=loadState();
function persistNow(){clearTimeout(persistT);try{localStorage.setItem(KEY,JSON.stringify(S));storageOk=true}catch(e){storageOk=false}lastSaved=Date.now();updateSaved()}
function persist(){clearTimeout(persistT);persistT=setTimeout(persistNow,350)}
function updateSaved(){const el=$('#savedAt');if(el)el.textContent=lastSaved?`Saved ${fmtTime(lastSaved)}`:'Not saved yet'}

const ui={page:'home',params:{},menu:false,streaming:false,stream:'',aiErr:'',taskQuery:'',srcQuery:'',srcFocus:null,
  mc:null,tc:{phase:'setup',mode:1,teams:[{name:'You',score:0}],count:5,diff:'easy',topic:'mixed'},
  assessId:null,justCompleted:null,justBadges:null,justXp:0,feedback:null,aboutLang:'en',chatDraft:'',gchat:{msgs:[],busy:false,err:'',draft:''}};

/* ---------- attempts ---------- */
function blankData(){return{
  think:{pick:-1,initial:''},
  consult:{read:false},
  check:{agree:'',reason:'',source:'',opened:{}},
  decide:{final:'',change:''}}}
function newAttempt(taskId){
  const at={id:uid('a'),taskId,createdAt:Date.now(),updatedAt:Date.now(),stage:1,maxStage:1,status:'in_progress',d:blankData()};
  S.attempts[at.id]=at;S.order.push(at.id);persistNow();return at}
const attemptsList=()=>S.order.map(id=>S.attempts[id]).filter(Boolean);
const completedList=()=>attemptsList().filter(a=>a.status==='completed');
const attemptsFor=t=>attemptsList().filter(a=>a.taskId===t);
const inProgressFor=t=>attemptsFor(t).find(a=>a.status==='in_progress');
const latestInProgress=()=>attemptsList().filter(a=>a.status==='in_progress').sort((a,b)=>b.updatedAt-a.updatedAt)[0];
function touch(at){at.updatedAt=Date.now();persist()}

/* ---------- XP, badges, streak, profile ---------- */
function addXP(n){S.xp=(S.xp||0)+Math.max(0,Math.floor(n));persist();return S.xp}
function awardBadge(key){if(!BADGES[key]||S.badges.includes(key))return false;S.badges.push(key);persistNow();return true}
function hasBadge(key){return S.badges.includes(key)}
const dayKey=(t=Date.now())=>{const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function bumpStreak(){const today=dayKey(),y=dayKey(Date.now()-864e5);
  if(S.streak.last===today)return S.streak.count;
  S.streak.count=S.streak.last===y?S.streak.count+1:1;S.streak.last=today;persist();return S.streak.count}
function currentStreak(){const today=dayKey(),y=dayKey(Date.now()-864e5);return(S.streak.last===today||S.streak.last===y)?S.streak.count:0}
function cleanName(v){return String(v||'').replace(/[\u0000-\u001f\u007f<>]/g,'').replace(/\s+/g,' ').trim().slice(0,40)}
function setProfileName(v){const n=cleanName(v);if(!n)return false;S.profile.name=n;if(!S.profile.id)S.profile.id=uid('u');persistNow();return true}
const profileName=()=>S.profile.name||'';
/* =====================================================================
   AI — Gemini is reached only through the secure server (api.js):
     • the final AI feedback at the end of every 4C task, and
     • the separate AI Chat page.
   The student never enters a key. In the 4C cycle the "AI suggestion" of each
   task is prepared in advance, so every statement in it can be checked
   against the Source Library.
   ===================================================================== */
const AI={sample:null,downloads:null,checked:false};
async function initCaps(){
  try{if(window.claude&&typeof claude.use==='function'){AI.downloads=await claude.use('downloads')}}catch(e){}
  AI.checked=true}
/* =====================================================================
   API CLIENT — ONE address: API_BASE, the secure server (a Cloudflare Worker).
   It is only used for Gemini (the final 4C feedback and the AI Chat page).
   API_BASE is an address, not a secret: the Gemini key lives only on the
   server and is never in this file, in the browser or in localStorage.
   While API_BASE is empty the app still works: the 4C feedback falls back to a clearly
   labelled automatic estimate, and AI Chat explains that it needs the server.
   ===================================================================== */
const API_BASE='https://ai-ct-teacher-ai.ai-ct-teacher-api.workers.dev';
const API={base:String(API_BASE||'').replace(/\/+$/,''),caps:{ai:false,checked:false,checking:false,err:''}};

function apiErr(code,status){const e=new Error(code);e.code=code;e.status=status||0;return e}
async function apiFetch(path,o){
  o=o||{};
  if(!API.base)throw apiErr('not_configured',0);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),o.timeout||15000);
  let res;
  try{res=await fetch(API.base+path,{method:o.method||'GET',signal:ctl.signal,
    headers:o.body?{'content-type':'application/json'}:{},
    body:o.body?JSON.stringify(o.body):undefined})}
  catch(e){clearTimeout(timer);throw apiErr('network',0)}
  clearTimeout(timer);
  let data=null;try{data=await res.json()}catch(e){}
  if(!res.ok)throw apiErr((data&&typeof data.error==='string'&&data.error)||'server_error',res.status);
  return data||{}}

/* GET /api/health tells whether the server has its Gemini key ready. */
async function apiCheck(force){
  if(!API.base){API.caps.checked=true;return API.caps}
  if(API.caps.checking||(API.caps.checked&&!force&&!API.caps.err))return API.caps;
  API.caps.checking=true;
  try{const d=await apiFetch('/api/health',{timeout:8000});API.caps.ai=!!d.ai;API.caps.err=''}
  catch(e){API.caps.ai=false;API.caps.err=e.code||'network'}
  API.caps.checking=false;API.caps.checked=true;return API.caps}

/* 4C final feedback: the task situation plus a summary of the student's work. The server answers with scores (1 to 5) and short texts. */
async function askBackendEval(scenario,work){
  const d=await apiFetch('/api/ai',{method:'POST',body:{mode:'evaluate',scenario,stage:'construct',studentResponse:work},timeout:30000});
  const e=d&&d.evaluation,n=v=>Math.max(1,Math.min(5,Math.round(+v)||1)),s=v=>typeof v==='string'?v.slice(0,900):'';
  if(!e||!e.scores||!Number.isFinite(+e.overall))throw apiErr('bad_response',0);
  return{scores:Object.fromEntries(COMP.map(c=>[c.key,n(e.scores[c.key])])),overall:n(e.overall),start:s(e.start),end:s(e.end),change:s(e.change),
    useful:['yes','partly','no'].includes(e.useful)?e.useful:'partly',usefulWhy:s(e.useful_reason),conclusion:s(e.conclusion),next:s(e.next_step)}}

/* AI Chat page: a free, general conversation (mode "chat"). The scenario field is only a placeholder for older servers. */
async function askBackendChat(transcript){
  const d=await apiFetch('/api/ai',{method:'POST',body:{mode:'chat',scenario:'General chat',stage:'consult',studentResponse:transcript},timeout:30000});
  if(typeof d.response!=='string'||!d.response.trim())throw apiErr('bad_response',0);
  return d}
/* charts + demo dashboard */
function radarSVG(vals,labels,size=280,max=4){
  const c=size/2,R=size/2-44,n=vals.length,ang=i=>-Math.PI/2+i*2*Math.PI/n;
  const P=(i,v)=>{const r=R*v/max;return[c+r*Math.cos(ang(i)),c+r*Math.sin(ang(i))]};
  const ring=k=>vals.map((_,i)=>P(i,k).map(x=>x.toFixed(1)).join(',')).join(' ');
  const poly=vals.map((v,i)=>P(i,v).map(x=>x.toFixed(1)).join(',')).join(' ');
  return `<svg class="radar" viewBox="-40 0 ${size+80} ${size}" role="img" aria-label="Radar chart of component levels: ${labels.map((l,i)=>l+' '+vals[i].toFixed(1)).join(', ')}">
   ${Array.from({length:max},(_,i)=>i+1).map(k=>`<polygon points="${ring(k)}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('')}
   ${vals.map((_,i)=>{const[x,y]=P(i,max);return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`}).join('')}
   <polygon points="${poly}" fill="var(--primary)" fill-opacity=".18" stroke="var(--primary)" stroke-width="2"/>
   ${vals.map((v,i)=>{const[x,y]=P(i,v);return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="var(--primary)"/>`}).join('')}
   ${labels.map((l,i)=>{const a=ang(i),x=c+(R+14)*Math.cos(a),y=c+(R+14)*Math.sin(a)+4,cs=Math.cos(a);return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${Math.abs(cs)<.2?'middle':cs>0?'start':'end'}">${esc(l)}</text>`}).join('')}
   ${Array.from({length:max},(_,i)=>i+1).map(k=>`<text x="${c+3}" y="${(c-R*k/max+3).toFixed(1)}" style="font-size:9px;fill:var(--ink-3)">${k}</text>`).join('')}</svg>`}
function lineSVG(pts,w=560,h=230,xl='Record'){
  if(!pts.length)return '';const l=40,r=14,t=14,b=32,iw=w-l-r,ih=h-t-b,n=pts.length;
  const X=i=>l+(n===1?iw/2:iw*i/(n-1)),Y=v=>t+ih*(1-v/100);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="Line chart of percentage scores over ${xl}: ${pts.map(p=>p.label+' '+p.v+'%').join(', ')}">
   ${[0,25,50,75,100].map(v=>`<line x1="${l}" x2="${w-r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${l-6}" y="${Y(v)+4}" text-anchor="end">${v}%</text>`).join('')}
   <polyline fill="none" stroke="var(--primary)" stroke-width="2.5" points="${pts.map((p,i)=>X(i)+','+Y(p.v)).join(' ')}"/>
   ${pts.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="4" fill="var(--primary)"/><text x="${X(i)}" y="${h-10}" text-anchor="middle">${esc(p.label)}</text>`).join('')}</svg>`}


function gameActivityHTML(){
  const comps=S.competitions||[];
  if(!comps.length)return'';
  const last=comps[comps.length-1];
  return `<div class="panel" style="margin-bottom:18px"><h3>🏆 Team Competition</h3>
   <div class="grid3"><div class="stat"><b>${comps.length}</b><span>competitions played</span></div></div>
   ${last?`<p class="small muted" style="margin-top:8px">Last competition: ${last.mode} team${last.mode===1?'':'s'}, ${last.difficulty}${last.topic?', '+last.topic:''}. Scores: ${last.results.map(r=>esc(r.name)+' '+r.score).join(', ')}.</p>`:''}
   <p class="small muted">Game results are learning-activity data. They are not part of the 4C feedback.</p></div>`}
/* =====================================================================
   SHELL + MAIN PAGES. English is the main language; Uzbek appears only as short, smaller support text (.support-uz).
   ===================================================================== */
const curAttempt=()=>S.attempts[ui.params.attemptId];
const MARK=`<span class="mark" aria-hidden="true"><span>AI<b>–</b>CT</span></span>`;
const BUILD_ID='2026-11-23-4c';   /* shown in the menu footer and the browser console, so you can see which version is live */
try{console.info('AI-CT TEACHER build '+BUILD_ID)}catch(e){}
const AUTHOR_NAME='SARVINOZ SOLEXONOVNA', INSTITUTION='Samarkand State Institute of Foreign Languages (SamDChTI)';
const uzs=t=>t?`<p class="support-uz">${t}</p>`:'';
const statusOf=t=>{const ip=inProgressFor(t.id),done=attemptsFor(t.id).filter(a=>a.status==='completed');
  if(ip)return{chip:`<span class="chip w">In progress, step ${ip.stage} of 4</span>`,ip,done};
  if(done.length)return{chip:`<span class="chip g">Completed${done.length>1?' ×'+done.length:''}</span>`,ip:null,done};
  return{chip:`<span class="chip">New</span>`,ip:null,done}};
function empty(title,text,btns=''){return `<div class="empty"><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="row" style="justify-content:center">${btns}</div></div>`}
const xpPillHTML=()=>`<span class="xp-pill" id="xpPill">⭐ ${S.xp||0} XP</span>`;
const myBadges=()=>S.badges.filter(k=>BADGES[k]);
function badgeHTML(key,anim){const b=BADGES[key];if(!b)return'';return `<span class="badge ${anim?'new':''}" title="${esc(b.desc)}">${b.icon} ${esc(b.name)}</span>`}
const soundBtn=()=>`<button class="ic-btn" data-act="sound" aria-pressed="${sndEnabled()}" aria-label="Sound on or off" title="Sound on / off">${sndEnabled()?'🔊':'🔇'}</button>`;

/* ---------- navigation (English only) ---------- */
const NAV=[['home','🏠','Home'],['library','📋','Tasks'],['cycle','🧭','4C cycle'],['sources','📚','Source Library'],['aichat','🤖','AI Chat'],['competition','🏆','Team Competition'],['progress','📈','My progress'],['about','ℹ️','About the project']];
const navBtn=(k,ic,label,page)=>`<button data-go="${k}" ${page===k?'aria-current="page"':''}><span class="nav-ic" aria-hidden="true">${ic}</span><span class="nav-tx"><b>${label}</b></span></button>`;
function brandHTML(){
  return `<div class="brandbox"><button class="brand" data-go="home" aria-label="AI-CT TEACHER, go to home">${MARK}<span class="brand-tt">AI-CT TEACHER</span></button>
   <div class="authorcard" aria-label="Author"><span class="ac-role">PhD RESEARCHER</span><span class="ac-name">${AUTHOR_NAME}</span><span class="ac-inst">${INSTITUTION}</span></div></div>`}
function renderShell(){
  const page=ui.page==='record'||ui.page==='assessment'?(ui.page==='assessment'?'library':'progress'):ui.page==='dashboard'||ui.page==='history'?'progress':ui.page;
  $('#side').innerHTML=`${brandHTML()}
   <nav class="nav" aria-label="Pages">${NAV.map(n=>navBtn(n[0],n[1],n[2],page)).join('')}</nav>
   <div class="side-foot"><div class="tools">${soundBtn()}<button class="ic-btn" data-act="projector" aria-pressed="${!!S.prefs.projector}" title="Projector mode: larger text for interactive whiteboards">📽️</button><button class="ic-btn" data-act="fullscreen" title="Full screen">⛶</button><button class="ic-btn" data-act="theme" title="Light / dark">🌓</button></div>
    <span id="storeState">${storageOk?'Saved in this browser':'Memory only (not persistent)'}</span><span class="tiny dim" id="buildId">build ${BUILD_ID}</span></div>`;
  $('#topbar').innerHTML=`${MARK}<span class="tb-t"><strong>AI-CT TEACHER</strong><span class="tb-a">PhD researcher · <b>${AUTHOR_NAME}</b></span></span>${soundBtn()}<button class="menu" data-act="menu" aria-expanded="${ui.menu}" aria-controls="side" aria-label="Menu">☰</button>`;
  let b=$('#bnav');if(!b){b=document.createElement('nav');b.id='bnav';b.className='bnav';b.setAttribute('aria-label','Quick navigation');document.body.appendChild(b)}
  b.innerHTML=[['home','🏠','Home'],['library','📋','Tasks'],['sources','📚','Library'],['aichat','🤖','AI Chat'],['progress','📈','Progress']].map(([k,ic,l])=>`<button data-go="${k}" ${page===k?'aria-current="page"':''}><span aria-hidden="true">${ic}</span><small>${l}</small></button>`).join('');
  $('#side').classList.toggle('open',ui.menu);$('#scrim').classList.toggle('hidden',!ui.menu)}

/* ---------- HOME ---------- */
function greetHTML(){
  const n=profileName(),st=currentStreak(),ip=latestInProgress();
  if(!n)return `<section class="panel greet"><div><h3>Welcome 👋</h3><p class="muted">Write your name to keep your own progress on this device.</p>
    <div class="namerow"><input id="nameIn" type="text" maxlength="40" autocomplete="nickname" placeholder="Your name" aria-label="Your name"><button class="btn" data-act="profile-save">Save</button></div><p class="hint">Your name is stored only on this device.</p></div></section>`;
  return `<section class="panel greet"><div><h3>Hello, ${esc(n)}! 👋</h3><div class="row" style="gap:8px;margin-top:8px">${xpPillHTML()}<span class="chip ${st?'w':''}">🔥 ${st} day${st===1?'':'s'} in a row</span><span class="chip">🏅 ${myBadges().length}/${Object.keys(BADGES).length} badges</span></div></div>
   ${ip?`<button class="btn" data-act="continue" data-attempt="${ip.id}">Continue ▶ <small>${esc(TASK_BY_ID[ip.taskId].title)}</small></button>`:`<button class="btn" data-act="random-task">▶ Today’s task</button>`}</section>`}
function viewHome(){
  const tiles=[['library','📋','Tasks',`${TASKS.length} real classroom situations from Uzbekistan. Each one takes about 5 minutes.`],['cycle','🧭','4C cycle','Think, Ask AI, Check, Decide. Then AI gives feedback on your thinking.'],['sources','📚','Source Library',`${SRC_KEYS.length} published research works that every AI statement is checked against.`],['aichat','🤖','AI Chat','Ask Gemini anything about English, grammar or teaching.'],['competition','🏆','Team Competition','A classroom quiz for teams on one screen.'],['progress','📈','My progress','Your feedback, how your opinions changed, XP and badges.']];
  return `<div class="page home">
   <section class="hero"><span class="orb o1" aria-hidden="true"></span><span class="orb o2" aria-hidden="true"></span><span class="orb o3" aria-hidden="true"></span>
    <div class="hero-in"><p class="eyebrow">Electronic methodological prototype</p><h1 class="hero-t">AI-CT TEACHER</h1>
     <p class="hero-s">Artificial Intelligence – Critical Thinking for Future English Teachers</p>${uzs(UZ.home.support)}
     <div class="hero-flow" aria-label="The 4C cycle">${STAGES.map((s,i)=>`<span class="hf ${s.key==='consult'?'ai':''}" style="animation-delay:${i*90}ms"><span aria-hidden="true">${s.icon}</span><b>${s.n}</b> ${s.student}</span>`).join('')}</div>
     <div class="hero-author"><span class="ha-l">PhD RESEARCHER</span><span class="ha-n">${AUTHOR_NAME}</span><span class="ha-i">${INSTITUTION}</span></div></div></section>
   ${greetHTML()}
   <h2 class="h-choose">What would you like to do?</h2>
   <div class="tiles">${tiles.map(([k,ic,t,d],i)=>`<button class="tile" data-go="${k}" style="animation-delay:${i*70}ms"><span class="tile-ic" aria-hidden="true">${ic}</span><span class="tile-t">${t}</span><span class="tile-d">${d}</span></button>`).join('')}</div>
   <section class="panel steps6"><h3>How it works, in 4 steps</h3><ol class="s6">${STAGES.map(s=>`<li class="${s.key==='consult'?'ai':''}"><span class="s6-ic" aria-hidden="true">${s.icon}</span><div><b>${s.n}. ${s.student}</b> <span class="sci">${s.name}</span><p class="primary-en">${esc(s.task)}</p></div></li>`).join('')}</ol>
    <p class="small muted">At the end, Gemini compares your first and final opinion and gives feedback from 1 to 5.</p></section>
   <section class="panel"><h3>What is AI-CT TEACHER?</h3><p class="primary-en">AI-CT TEACHER is an electronic methodological prototype that helps future English teachers learn to analyse and verify AI output instead of accepting it. <button class="linkbtn" data-go="about">Read more</button></p>${uzs(UZ.home.whatSupport)}</section></div>`}

/* ---------- ABOUT (English by default; Uzbek tab optional) ---------- */
const ABOUT_EN=[
 {h:'What is AI-CT TEACHER?',p:['AI-CT TEACHER is an electronic methodological prototype for developing future English teachers\' critical thinking through structured interaction with artificial intelligence.','It treats AI output as an object of critical analysis: students think first, read an AI suggestion, check every statement against published research, and then make their own decision.']},
 {h:'The AI-CT 4C cycle',p:[],table:true},
 {h:'Source Library',p:['Every statement in every AI suggestion is linked to published, citable research: method or theory, author, year and work. Students open these sources in the Check step and in the Source Library page. Teachers should check the list against the original works before using it in research.']},
 {h:'How AI is used',p:['The AI suggestion in each task is prepared in advance in the typical style of AI answers, so that every statement can be checked against sources. Gemini is used, through a secure server, for the final feedback on the student\'s critical thinking and on the separate AI Chat page. The API key is kept on the server; students never enter a key.','AI feedback can contain mistakes. It is a learning aid, not a validated test.']},
 {h:'Feedback',p:['At the end of a task, Gemini compares the student\'s first opinion, reasoning and final solution, and gives a level from 1 to 5 for five critical thinking skills (analysis, evaluation, inference, explanation, self-regulation; after Facione, 1990), with a short conclusion. If the AI is not available, the app shows a clearly labelled automatic estimate.']},
 {h:'Your data',p:['Results, XP, badges and your written answers are stored only in this browser. You can export your records as JSON or CSV from My progress. For the AI feedback, the text of your answers is sent to the server for that one request.']},
 {h:'Research use and limits',p:['This is a research prototype, not an official product of any institution. For research use, trained human raters should also score records, and scientific validity comes from the study design, sample and analysis, not from the software alone.']}];
const ABOUT_ROWS=uz=>STAGES.map((s,i)=>`<tr><td><b>${s.n} ${s.student}</b><br><span class="small muted">${s.name}</span></td><td>${esc(s.task)}</td>${uz?`<td>${UZ.stage[i].t}</td>`:''}</tr>`).join('');
function viewAbout(){
  const uz=ui.aboutLang==='uz',src=uz?UZ.about:ABOUT_EN;
  return `<div class="page prose"><div class="page-head"><h1>${uz?UZ.aboutTitle:'About the project'}</h1><p>${uz?UZ.aboutLead:'An electronic methodological prototype for developing critical thinking through structured interaction with AI.'}</p></div>
   <div class="tabs" role="tablist" aria-label="Language"><button role="tab" aria-selected="${!uz}" data-act="about-lang" data-lang="en">English</button><button role="tab" aria-selected="${uz}" data-act="about-lang" data-lang="uz">Oʻzbekcha</button></div>
   <div class="about-id"><div class="author"><span class="author-l">PhD RESEARCHER</span><span class="author-n">${AUTHOR_NAME}</span></div><div class="author"><span class="author-l">${uz?UZ.institution:'INSTITUTION'}</span><span class="author-n">${INSTITUTION}</span></div></div>
   <p class="diss"><b>${uz?UZ.dissLabel:'Dissertation topic'}:</b> <em>${UZ.dissertation}</em></p>
   ${src.map(s=>`<h3>${s.h}</h3>${(s.p||[]).map(p=>`<p>${p}</p>`).join('')}${s.table?`<div class="tablewrap"><table><thead><tr><th>${uz?UZ.cols[0]:'Step'}</th><th>${uz?UZ.cols[1]:'What the student does'}</th>${uz?`<th>${UZ.cols[2]}</th>`:''}</tr></thead><tbody>${ABOUT_ROWS(uz)}</tbody></table></div><p class="muted small">${uz?UZ.cycleNote:'Four steps, always in this order: Contextualize (Think), Consult (Ask AI), Critique (Check), Construct (Decide).'}</p>`:''}`).join('')}</div>`}

/* ---------- AI CHAT: a free, general conversation with Gemini (separate from the 4C cycle; nothing is scored) ---------- */
function fmtAI(t){
  const inl=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'),isLi=l=>/^\s*([-*•]|\d+[.)])\s+/.test(l);
  return String(t).replace(/\r/g,'').split(/\n{2,}/).map(par=>{const lines=par.split('\n').filter(l=>l.trim());if(!lines.length)return'';
    if(lines.every(isLi))return '<ul>'+lines.map(l=>'<li>'+inl(l.replace(/^\s*([-*•]|\d+[.)])\s+/,''))+'</li>').join('')+'</ul>';
    return '<p>'+lines.map(inl).join('<br>')+'</p>'}).join('')}
function gcNotesHTML(x){
  if(!x||(!x.claims.length&&!x.assumptions.length&&!x.uncertainty&&!x.followUp))return'';
  return `<details class="gc-notes"><summary>AI notes</summary><div>${x.claims.length?`<p><b>Worth checking:</b> ${x.claims.map(esc).join('; ')}</p>`:''}${x.assumptions.length?`<p><b>Assumptions:</b> ${x.assumptions.map(esc).join('; ')}</p>`:''}${x.uncertainty?`<p><b>Least sure about:</b> ${esc(x.uncertainty)}</p>`:''}${x.followUp?`<p><b>You could ask:</b> <button type="button" class="chip-btn" data-act="gc-idea" data-q="${esc(x.followUp)}">${esc(x.followUp)}</button></p>`:''}</div></details>`}
function gcStatusHTML(){
  if(!API.base)return '<span class="gc-dot off"></span> The AI service is not connected on this site, so AI Chat is unavailable.';
  if(!API.caps.checked||API.caps.checking)return '<span class="gc-dot"></span> Connecting to the AI service…';
  if(API.caps.err)return '<span class="gc-dot off"></span> The AI service is temporarily unavailable. <button type="button" class="linkbtn" data-act="api-retry">Check again</button>';
  if(!API.caps.ai)return '<span class="gc-dot off"></span> The AI service answers, but its Gemini key is not set yet.';
  return '<span class="gc-dot on"></span> Gemini is connected. You never enter an API key.'}
function gchatLogHTML(){
  const G=ui.gchat;
  let h=G.msgs.map(m=>m.role==='user'
    ?`<div class="gc-msg you"><div class="gc-who">You</div><div class="gc-bubble you">${esc(m.text)}</div></div>`
    :`<div class="gc-msg ai"><div class="gc-who">AI · Gemini</div><div class="gc-bubble ai">${fmtAI(m.text)}${gcNotesHTML(m.extra)}</div></div>`).join('');
  if(G.busy)h+=`<div class="gc-msg ai"><div class="gc-who">AI · Gemini</div><div class="gc-bubble ai"><span class="thinking" aria-live="polite">Thinking <i></i><i></i><i></i></span></div></div>`;
  if(G.err)h+=`<div class="notice b"><p>${esc(G.err)}</p>${G.draft?`<p><button type="button" class="btn" data-act="gc-retry">Try again</button></p>`:''}</div>`;
  if(!G.msgs.length&&!G.busy&&!G.err)h=`<div class="gc-empty"><p class="primary-en">Ask a question to start the conversation.</p></div>`;
  return h}
function viewAIChat(){
  const G=ui.gchat,can=gchatCan(),dis=can?'':'disabled';
  const ideas=[UZ.chat.ex[0],'I have a problem with my students. They are afraid of speaking. What can I do?',UZ.chat.ex[1]];
  return `<div class="page gc"><div class="page-head"><h1>AI Chat</h1><p>Ask anything about English, grammar, teaching or your studies. Gemini answers, and you can keep the conversation going.</p>${uzs(UZ.chat.page)}</div>
   <div class="card gc-card"><div class="gc-status" id="gcStatus">${gcStatusHTML()}</div>
    <div id="gcLog" class="gc-log" role="log" aria-live="polite" aria-label="Conversation">${gchatLogHTML()}</div>
    <div class="gc-ideas" id="gcIdeas" role="group" aria-label="Question ideas" ${G.msgs.length?'hidden':''}>${ideas.map(q=>`<button type="button" class="chip-btn" data-act="gc-idea" data-q="${esc(q)}" ${dis}>${esc(q)}</button>`).join('')}</div>
    <div class="gc-composer"><textarea id="gcIn" rows="2" maxlength="${GCHAT_MAX_Q}" placeholder="Type your message…" aria-label="Your message" ${dis}>${esc(G.draft||'')}</textarea><button type="button" class="btn" id="gcSend" data-act="gc-send" ${dis}>Send ▶</button></div>
    <div class="row gc-foot"><span class="hint">Enter to send · Shift+Enter for a new line</span><button type="button" class="btn quiet sm" id="gcNew" data-act="gc-new" ${G.msgs.length?'':'hidden'}>New chat</button></div></div>
   <p class="small muted">AI can make mistakes. Check important facts before you rely on them.</p></div>`}

/* ---------- MY PROGRESS ---------- */
function viewProgress(){
  const done=completedList().filter(a=>!a.sample),all=completedList(),ips=attemptsList().filter(a=>a.status==='in_progress'),name=profileName();
  const ev=done.map(evalOf),cm=COMP.map(c=>ev.length?avg(ev.map(e=>e.scores[c.key])):0);
  const cnt=(arr,k)=>arr.filter(x=>x===k).length,ch=done.map(a=>a.d.decide.change),ag=done.map(a=>a.d.check.agree),src=done.length?avg(done.map(a=>Object.keys(a.d.check.opened).length)):0;
  const bar=(n,tot)=>`<span class="mini-bar"><i style="width:${tot?Math.round(n/tot*100):0}%"></i></span>`;
  return `<div class="page"><div class="page-head"><h1>My progress</h1><p>Your account, feedback, XP and badges. Everything is stored on this device only.</p></div>
   <div class="grid2" style="margin-bottom:18px"><div class="panel"><h3>My account</h3>
     <div class="namerow"><input id="nameIn" type="text" maxlength="40" value="${esc(name)}" placeholder="Your name" aria-label="Your name"><button class="btn" data-act="profile-save">${name?'Update':'Save'}</button></div>
     <p class="hint">Your account lives in this browser (no password). Another device has its own account.</p>
     <div class="grid3" style="margin-top:10px"><div class="stat"><b>${S.xp||0}</b><span>XP</span></div><div class="stat"><b>🔥 ${currentStreak()}</b><span>day streak</span></div><div class="stat"><b>${done.length}</b><span>tasks done</span></div></div></div>
    <div class="panel"><h3>Badges</h3><div class="badge-row">${Object.entries(BADGES).map(([k,b])=>{const e=hasBadge(k);return `<span class="badge ${e?'':'locked'}" title="${esc(b.desc)}">${b.icon} ${esc(b.name)}${e?'':' 🔒'}</span>`}).join('')}</div><p class="small muted" style="margin-top:8px">Hover or tap a badge to see how to earn it.</p></div></div>
   ${ips.length?`<h2>In progress</h2><div class="stack" style="margin-bottom:20px">${ips.map(a=>`<div class="panel row" style="justify-content:space-between"><div><b>Task ${TASK_BY_ID[a.taskId].num}. ${esc(TASK_BY_ID[a.taskId].title)}</b><div class="muted small">Step ${a.stage} of 4, ${STAGES[a.stage-1].student}</div></div><button class="btn" data-act="continue" data-attempt="${a.id}">Continue</button></div>`).join('')}</div>`:''}
   ${done.length?`<div class="grid2" style="margin-bottom:18px"><div class="panel"><h3>My critical thinking profile</h3>${radarSVG(cm,COMP.map(c=>c.name),280,5)}<p class="small muted">Average feedback level (1 to 5) over your tasks. Criteria after Facione (1990). A learning aid, not a validated test.</p></div>
     <div class="panel"><h3>How my thinking moved</h3>
      <div class="dist"><b>Opinion change</b>${CHANGE.map(([k,l])=>`<div class="dist-row"><span>${l}</span>${bar(cnt(ch,k),done.length)}<span>${cnt(ch,k)}</span></div>`).join('')}</div>
      <div class="dist"><b>Position on the AI suggestion</b>${AGREE.map(([k,l])=>`<div class="dist-row"><span>${l}</span>${bar(cnt(ag,k),done.length)}<span>${cnt(ag,k)}</span></div>`).join('')}</div>
      <p class="small muted">On average you checked <b>${src.toFixed(1)}</b> of 6 sources per task.</p></div></div>
     <div class="panel" style="margin-bottom:18px"><h3>Recent tasks</h3><div class="stack" style="gap:8px">${done.slice(-8).reverse().map(a=>{const t=TASK_BY_ID[a.taskId],e=evalOf(a);return `<div class="row act-row"><div><b>Task ${t.num}. ${esc(t.title)}</b><div class="small muted">${fmtDate(a.completedAt)} · level ${e.overall}/5 · ${e.mode==='ai'?'AI feedback':'automatic estimate'}</div></div><div class="row" style="gap:6px"><button class="btn quiet sm" data-go="assessment" data-id="${a.id}">Result</button><button class="btn quiet sm" data-go="record" data-id="${a.id}">Record</button></div></div>`}).join('')}</div></div>`
    :empty('Nothing here yet','Finish your first task and your feedback will appear here.',`<button class="btn" data-act="random-task">Today’s task</button><button class="btn quiet" data-act="sample">Load a sample record</button>`)}
   ${gameActivityHTML()}
   <div class="panel"><h3>Export and data</h3><p class="small muted">Download your records as JSON or CSV, for example for research. The files are created on this device; nothing is uploaded.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="export" data-kind="json" ${all.length?'':'disabled'}>Export JSON</button><button class="btn" data-act="export" data-kind="csv" ${all.length?'':'disabled'}>Export CSV</button><button class="btn quiet" data-act="sample">Load sample record</button><button class="btn danger" data-act="reset">Delete all my data</button></div>
    ${S.legacy?`<p class="small muted" style="margin-top:8px">${S.legacy} record(s) from the older 6C version are kept on this device but are not shown.</p>`:''}</div></div>`}

/* ---------- TASKS: one list of 100 ---------- */
function taskCard(t){const s=statusOf(t);
  return `<article class="task"><div class="tn" aria-hidden="true">${t.num}</div><div><h3>${esc(t.title)}</h3><p>${esc(excerpt(t.ctx,150))}</p><div class="meta"><span class="chip p">${esc(t.skill)}</span>${t.level&&t.level!=='—'?`<span class="chip">${esc(t.level)}</span>`:''}<span class="chip">≈5 min</span>${s.chip}</div></div>
   <div class="acts">${s.ip?`<button class="btn" data-act="continue" data-attempt="${s.ip.id}">Continue</button>`:`<button class="btn" data-act="start-task" data-task="${t.id}">${s.done.length?'Again':'Start'} ▶</button>`}</div></article>`}
const taskMatch=(t,q)=>!q||(t.num+' '+t.title+' '+t.skill+' '+t.ctx).toLowerCase().includes(q);
function viewLibrary(){
  const q=ui.taskQuery.trim().toLowerCase(),list=TASKS.filter(t=>taskMatch(t,q)),done=TASKS.filter(t=>attemptsFor(t.id).some(a=>a.status==='completed')).length;
  return `<div class="page"><div class="page-head"><h1>Tasks</h1><p>${TASKS.length} real classroom situations. Each one follows the 4C cycle and takes about 5 minutes. ${done?`You have completed ${done}.`:''}</p>${uzs(UZ.tasksLead)}
    <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:10px"><button class="btn" data-act="random-task">▶ Today’s task</button><input id="taskQ" class="search" type="search" placeholder="Search tasks: speaking, AI, Grade 9…" aria-label="Search tasks" value="${esc(ui.taskQuery)}"></div></div>
   <p class="small muted" id="taskCount">${list.length===TASKS.length?'':`${list.length} of ${TASKS.length} tasks`}</p>
   <div class="tasks" id="taskList">${list.length?list.map(taskCard).join(''):empty('No tasks found','Try another word.')}</div></div>`}
function refreshTaskList(){const q=ui.taskQuery.trim().toLowerCase(),list=TASKS.filter(t=>taskMatch(t,q)),l=$('#taskList'),c=$('#taskCount');
  if(l)l.innerHTML=list.length?list.map(taskCard).join(''):empty('No tasks found','Try another word.');if(c)c.textContent=list.length===TASKS.length?'':`${list.length} of ${TASKS.length} tasks`}

/* ---------- SOURCE LIBRARY ---------- */
const srcMatch=(k,q)=>{const s=SOURCES[k];return !q||(s.m+' '+s.a+' '+s.y+' '+s.ref+' '+s.idea).toLowerCase().includes(q)};
function srcCardHTML(k){const s=SOURCES[k],used=SRC_USED[k]||[];
  return `<article class="src-card" id="src-${k}"><div class="src-card-h"><h3>${esc(s.m)}</h3><span class="chip">${s.y}</span></div><p class="src-auth">${esc(s.a)}</p><p class="src-ref">${s.ref}</p><p>${esc(s.idea)}</p>
   ${used.length?`<p class="small muted">Used in ${used.length} task${used.length>1?'s':''}: ${used.slice(0,12).map(n=>`<button type="button" class="linkbtn" data-act="start-task" data-task="t${n}">${n}</button>`).join(', ')}${used.length>12?' …':''}</p>`:''}</article>`}
function sourcesListHTML(){const q=ui.srcQuery.trim().toLowerCase();
  const groups=SRC_GROUPS.map(([g,label])=>{const ks=SRC_KEYS.filter(k=>SOURCES[k].g===g&&srcMatch(k,q));return ks.length?`<section class="src-group"><h2>${esc(label)}</h2>${ks.map(srcCardHTML).join('')}</section>`:''}).join('');
  return groups||empty('No sources found','Try another word.')}
function viewSources(){
  return `<div class="page"><div class="page-head"><h1>Source Library</h1><p>${SRC_KEYS.length} published works. Every statement in every AI suggestion is checked against these sources. Each entry gives the method or theory, the author, the year, the full reference and the main idea.</p>${uzs(UZ.sourcesLead)}
    <input id="srcQ" class="search" type="search" placeholder="Search: anxiety, feedback, AI, Krashen…" aria-label="Search sources" value="${esc(ui.srcQuery)}" style="margin-top:10px"></div>
   <div class="notice"><p>Summaries are written in plain words for students. Before citing a work in research, read the original.</p></div>
   <div id="srcList">${sourcesListHTML()}</div></div>`}
function focusSource(k){const el=document.getElementById('src-'+k);if(!el)return;el.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}

function footerHTML(){return `<footer class="site-foot"><div class="author sm"><span class="author-l">PhD RESEARCHER</span><span class="author-n">${AUTHOR_NAME}</span></div><div class="author sm"><span class="author-l">INSTITUTION</span><span class="author-n">${INSTITUTION}</span></div><p class="ft"><b>AI-CT TEACHER</b> · Research prototype. Your data stays in this browser.</p></footer>`}
/* =====================================================================
   4C VIEWS — Think → Ask AI → Check → Decide, the source window, the
   result page with AI feedback, and the record page.
   ===================================================================== */
function fld2(at,path,o){const v=getPath(at.d,path)||'',n=W(path==='check.reason'?reasonText(v):v),min=o.min||0,id='f-'+path.replace(/\./g,'-');
  return `<div class="fld"><label class="lab" for="${id}">${esc(o.label)}</label>${o.uz?`<p class="support-uz">${o.uz}</p>`:''}<textarea id="${id}" rows="${o.rows||3}" data-b="${path}" placeholder="${esc(o.ph||'')}" maxlength="${o.max||900}">${esc(v)}</textarea><div class="cnt ${n>=min?'ok':''}" data-cnt="${path}" data-min="${min}">${min?`${n} / ${min}+ words`:`${n} words`}</div></div>`}
const choiceHTML=(label,cls,act,i,extra='')=>`<button type="button" class="choice ${cls}" data-act="${act}" data-i="${i}" ${extra}><span class="ch-k" aria-hidden="true">${'ABC'[i]}</span><span>${esc(label)}</span></button>`;
const chipsHTML=(act,list,cur,label)=>`<div class="pick-row" role="group" aria-label="${esc(label)}">${list.map(([v,l])=>`<button type="button" class="pick" data-act="${act}" data-v="${v}" aria-pressed="${cur===v}">${esc(l)}</button>`).join('')}</div>`;
const verdictPill=v=>`<span class="vpill ${VERDICT[v].cls}">${VERDICT[v].label}</span>`;
const srcLinks=(keys,seg)=>keys.map(k=>`<button type="button" class="srclink" data-act="src-open" data-src="${k}"${seg!==undefined?` data-seg="${seg}"`:''}>${esc(srcShort(k))}</button>`).join('<span class="dim"> · </span>');
function situationCard(t){
  return `<article class="card scen"><p>${esc(t.ctx)}</p><div class="facts">${t.facts.map(([k,v])=>`<span><b>${esc(k)}:</b> ${esc(v)}</span>`).join('')}</div>${t.uz?`<p class="support-uz">${t.uz}</p>`:''}</article>`}

/* ---------- Stage 1: Contextualize (Think) ---------- */
function stage1(at){
  const t=TASK_BY_ID[at.taskId],c=at.d.think,q=t.q1,locked=c.pick>=0;
  return `${situationCard(t)}
   <div class="card"><h3>1. ${esc(q.ask)}</h3>${uzs(UZ.q.problem)}<div class="choices" role="group" aria-label="${esc(q.ask)}">${q.options.map((o,i)=>choiceHTML(o,(c.pick===i?'sel ':'')+(locked&&i===q.best?'right ':'')+(locked&&c.pick===i&&i!==q.best?'miss':''),'pick1',i,locked?'aria-disabled="true"':'')).join('')}</div>
    ${locked?`<p class="fb ${c.pick===q.best?'g':'w'}" role="status">${c.pick===q.best?'✓ Good thinking. ':'Not the best choice. '}${esc(q.why)}</p>`:`<p class="hint">Choose one. You can choose only once, so go with your own thinking.</p>`}</div>
   <div class="card">${fld2(at,'think.initial',{label:'2. What would you do? Why?',uz:UZ.q.initial,min:5,ph:'I would… because…'})}<p class="hint">This is your first opinion. At the end you will compare it with your final solution.</p></div>`}

/* ---------- Stage 2: Consult (Ask AI) ---------- */
function stage2(at){
  const t=TASK_BY_ID[at.taskId];
  return `${situationCard(t)}
   <div class="card ai-card"><div class="ai-box"><div class="ai-label"><span>AI SUGGESTION</span><span class="small">prepared for this task</span></div>
    <ol class="ai-list">${t.statements.map(s=>`<li>${esc(s.text)}</li>`).join('')}</ol>
    <div class="ai-foot ai-warn">This answer was prepared to show how AI often answers: confident, partly useful, partly wrong. In the next step you will check every statement against the Source Library.</div></div></div>
   <div class="notice"><p><strong>Read it as a claim to examine, not as the truth.</strong> ${uzs(UZ.consultNote)}</p></div>`}

/* ---------- Stage 3: Critique (Check) ---------- */
function stmtListHTML(at){
  const t=TASK_BY_ID[at.taskId],op=at.d.check.opened;
  return `<ol class="stmts">${t.statements.map((s,i)=>`<li class="stmt ${op[i]?'opened':''}"><div class="stmt-top"><span class="stmt-n">${i+1}</span><p>${esc(s.text)}</p></div>
    <div class="stmt-src">${op[i]?verdictPill(s.v):'<span class="small muted">Source:</span>'} ${srcLinks(s.src,i)} <button type="button" class="btn quiet sm" data-act="src-stmt" data-seg="${i}">${op[i]?'Open again':'Check this statement'}</button></div></li>`).join('')}</ol>`}
function stage3(at){
  const c=at.d.check,t=TASK_BY_ID[at.taskId],n=Object.keys(c.opened).length;
  return `<details class="card mini-ai"><summary>Show the AI suggestion again</summary><ol class="ai-list">${t.statements.map(s=>`<li>${esc(s.text)}</li>`).join('')}</ol></details>
   <div class="card"><h3>1. Do you agree with the AI suggestion?</h3>${uzs(UZ.q.agree)}${chipsHTML('agree',AGREE,c.agree,'Do you agree with the AI suggestion?')}</div>
   <div class="card">${fld2(at,'check.reason',{label:'2. Why? Explain your reasoning.',uz:UZ.q.why,min:4,ph:'Because…'})}</div>
   <div class="card"><h3>3. Do you need to check an external source?</h3>${uzs(UZ.q.source)}${chipsHTML('source',[['yes','Yes'],['no','No']],c.source,'Do you need to check an external source?')}
    ${c.source==='yes'?`<p class="hint">Every statement of the AI suggestion is linked to published research in the Source Library. Open each one and read what the research says. <b>${n} of ${t.statements.length}</b> checked.</p><div id="stmtList">${stmtListHTML(at)}</div>`
     :c.source==='no'?`<p class="hint">You decided not to check. You can still change your answer to “Yes” and open the sources.</p>`:''}</div>`}

/* ---------- Stage 4: Construct (Decide) ---------- */
function stage4(at){
  const d=at.d;
  return `<div class="card">${fld2(at,'decide.final',{label:'1. What is your final solution? Why?',uz:UZ.q.final,min:8,rows:4,ph:'My final solution is… because…'})}</div>
   <div class="card"><h3>2. How is it different from your initial opinion?</h3>${uzs(UZ.q.diff)}
    <div class="cmp2"><div><span class="lbl">Your first opinion</span><p>${esc(d.think.initial)||'—'}</p></div><div><span class="lbl">Your final solution</span><p id="finalEcho">${esc(d.decide.final)||'…'}</p></div></div>
    ${chipsHTML('change',CHANGE,d.decide.change,'How did your opinion change?')}</div>`}
function stageHTML(at){return[stage1,stage2,stage3,stage4][at.stage-1](at)}

/* ---------- source window: one statement at a time, with its research ---------- */
function srcEntryHTML(k,opt){
  const s=SOURCES[k];if(!s)return '';opt=opt||{};
  return `<article class="src-entry"><h4>${esc(s.m)}</h4><div class="kv"><b>Author</b><span>${esc(s.a)}</span><b>Year</b><span>${s.y}</span></div><p class="src-ref">${s.ref}</p><p>${esc(s.idea)}</p>
   ${opt.lib?`<button type="button" class="linkbtn" data-act="src-lib" data-src="${k}">Show in the Source Library ↗</button>`:''}</article>`}
function closeSrc(){const ov=$('#overlay');ov.innerHTML='';document.removeEventListener('keydown',srcKey);if(ui.srcReturn&&ui.srcReturn.focus)ui.srcReturn.focus();ui.srcReturn=null}
function srcKey(e){if(e.key==='Escape')closeSrc()}
/* seg = statement number (0-based) inside the current task, or undefined for a single source */
function openSrc(seg,key){
  const at=curAttempt(),t=at?TASK_BY_ID[at.taskId]:null,ov=$('#overlay');
  ui.srcReturn=ui.srcReturn||document.activeElement;
  let html='';
  if(seg!==undefined&&t){
    const s=t.statements[seg];if(!s)return;
    if(at.status==='in_progress'&&!at.d.check.opened[seg]){at.d.check.opened[seg]=true;touch(at)}
    const keys=key&&s.src.includes(key)?[key,...s.src.filter(x=>x!==key)]:s.src;
    html=`<div class="src-head"><span class="eyebrow">Source Library · statement ${seg+1} of ${t.statements.length}</span><button type="button" class="btn quiet sm" data-act="src-close">Close ✕</button></div>
     <blockquote class="src-claim">“${esc(s.text)}”</blockquote>
     <div class="src-verdict ${VERDICT[s.v].cls}">${verdictPill(s.v)}<p>${esc(s.why)}</p></div>
     <h3 class="src-h">What the research says</h3>${keys.map(k=>srcEntryHTML(k,{lib:true})).join('')}
     <div class="src-nav"><button type="button" class="btn quiet sm" data-act="src-stmt" data-seg="${seg-1}" ${seg===0?'disabled':''}>← Previous</button><span class="small muted">${Object.keys(at.d.check.opened).length} of ${t.statements.length} checked</span><button type="button" class="btn sm" data-act="src-stmt" data-seg="${seg+1}" ${seg===t.statements.length-1?'disabled':''}>Next statement →</button></div>`}
  else if(key&&SOURCES[key]){
    html=`<div class="src-head"><span class="eyebrow">Source Library</span><button type="button" class="btn quiet sm" data-act="src-close">Close ✕</button></div>${srcEntryHTML(key,{lib:true})}`}
  else return;
  ov.innerHTML=`<div class="modal-bg" data-src-bg><div class="modal src-modal" role="dialog" aria-modal="true" aria-label="Source Library">${html}</div></div>`;
  ov.querySelector('[data-src-bg]').addEventListener('click',e=>{if(e.target.hasAttribute('data-src-bg'))closeSrc()});
  document.removeEventListener('keydown',srcKey);document.addEventListener('keydown',srcKey);
  const m=ov.querySelector('.src-modal');m.scrollTop=0;const f=m.querySelector('[data-act="src-close"]');f&&f.focus();
  if(ui.page==='cycle'&&at&&at.stage===3){const l=$('#stmtList');if(l)l.innerHTML=stmtListHTML(at);const st=$('#stageMain');if(st&&!l)rerenderStage();updateLive()}}

/* ---------- cycle page ---------- */
function traceHTML(at){const d=at.d,t=TASK_BY_ID[at.taskId],n=Object.keys(d.check.opened).length;
  const items=[[1,d.think.pick>=0?esc(excerpt(t.q1.options[d.think.pick],60)):''],[2,d.consult.read?'AI suggestion read':''],[3,d.check.agree?esc((AGREE.find(a=>a[0]===d.check.agree)||[])[1])+(n?` · ${n} sources checked`:''):''],[4,d.decide.change?esc((CHANGE.find(a=>a[0]===d.decide.change)||[])[1]):'']];
  return items.filter(x=>x[1]).map(([k,v])=>`<span class="tr-chip"><b>${STAGES[k-1].student}</b> ${v}</span>`).join('')}
function viewCycle(){const at=curAttempt();return at?stageScreen(at):cycleExplainer()}
function cycleExplainer(){
  const ips=attemptsList().filter(a=>a.status==='in_progress');
  return `<div class="page"><div class="page-head"><h1>The AI-CT 4C cycle</h1><p>Every task has four short steps: Think, Ask AI, Check and Decide. At the end, AI gives feedback on how your thinking changed.</p>${uzs(UZ.cycleLead)}</div>
   <ol class="cyc6 cyc4">${STAGES.map((s,i)=>`<li class="${s.key==='consult'?'ai':''}" style="animation-delay:${i*80}ms"><span class="c6-n">${s.n}</span><span class="c6-ic" aria-hidden="true">${s.icon}</span><div><h3>${s.student} <span class="sci">${s.name}</span></h3><p class="primary-en">${esc(s.task)}</p>${uzs(UZ.stage[i].t)}</div></li>`).join('')}</ol>
   ${ips.length?`<h2>In progress</h2><div class="stack" style="margin-bottom:20px">${ips.map(a=>`<div class="panel row" style="justify-content:space-between"><div><b>Task ${TASK_BY_ID[a.taskId].num}. ${esc(TASK_BY_ID[a.taskId].title)}</b><div class="muted small">Step ${a.stage} of 4, ${STAGES[a.stage-1].student}</div></div><button class="btn" data-act="continue" data-attempt="${a.id}">Continue</button></div>`).join('')}</div>`:''}
   <div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn" data-go="library">📚 All tasks</button><button class="btn ghost" data-act="random-task">🎲 Today’s task</button><button class="btn quiet" data-go="sources">🔎 Source Library</button></div></div>`}
function stageScreen(at){
  const t=TASK_BY_ID[at.taskId],st=STAGES[at.stage-1];
  return `<div class="page"><div class="cyc-head"><h2>Task ${t.num}. ${esc(t.title)}</h2><div class="row" style="gap:8px"><span class="chip p">${esc(t.skill)}</span>${t.level&&t.level!=='—'?`<span class="chip">${esc(t.level)}</span>`:''}${at.sample?'<span class="chip demo">SAMPLE RECORD</span>':''}${at.status==='completed'?'<span class="chip g">Completed</span>':''}</div></div>
   <ol class="stepper four" aria-label="AI-CT 4C progress">${STAGES.map(s=>{const done=s.n<at.stage||(at.status==='completed'&&s.n<=at.stage),cur=s.n===at.stage,can=canEnter(at,s.n)||cur;
     return `<li class="step ${s.key==='consult'?'ai':''} ${cur?'current':''} ${done&&!cur?'done':''} ${!can?'locked':''}"><button data-act="stage" data-stage="${s.n}" ${cur?'aria-current="step"':''} ${!can?'aria-disabled="true"':''} aria-label="Step ${s.n}: ${s.student} (${s.name})${cur?', current':done?', completed':can?'':', locked'}"><span class="dot">${done&&!cur?'✓':s.icon}</span><span class="lb">${s.student}<small>${s.name}</small></span></button></li>`}).join('')}</ol>
   <section class="brief2"><div><b class="brief-t">Step ${st.n} of 4 · ${st.student}</b> <span class="sci">${st.name}</span><p class="primary-en">${esc(st.task)}</p>${uzs(UZ.stage[st.n-1].t)}</div></section>
   <div class="stage-main" id="stageMain">${stageHTML(at)}</div>
   <div class="trace2" id="traceList">${traceHTML(at)}</div>
   <div class="actionbar"><details class="reqs"><summary id="reqSum"></summary><ul id="reqList"></ul></details><div class="acts-r"><span class="saved" id="savedAt">${lastSaved?'Saved '+fmtTime(lastSaved):''}</span>
    <button class="btn quiet sm" data-act="back" ${at.stage===1?'disabled':''}>← Back</button><button class="btn quiet sm" data-act="later">Continue later</button>
    ${at.stage<4?`<button class="btn" id="nextBtn" data-act="next">Next: ${st.next} ▶</button>`:`<button class="btn" id="nextBtn" data-act="finish">${at.status==='completed'?'View result':'Finish and get AI feedback ✓'}</button>`}</div></div></div>`}

/* ---------- result page: AI feedback ---------- */
function barsHTML(v,max=5){return `<span class="lvl-dots five" aria-label="${v} of ${max}">${Array.from({length:max},(_,i)=>`<i class="${i<v?'on':''}"></i>`).join('')}</span>`}
function feedbackHTML(at){
  const e=at.eval;
  if(at.evalBusy&&!e)return `<div class="panel eval-wait"><span class="thinking" aria-live="polite">AI is reading your answers <i></i><i></i><i></i></span><p class="small muted">This takes a few seconds.</p></div>`;
  if(!e)return `<div class="panel"><p>No feedback yet.</p><button class="btn" data-act="eval-retry" data-id="${at.id}">Get AI feedback</button></div>`;
  const ai=e.mode==='ai',useful={yes:'Yes',partly:'Partly',no:'No',unclear:'Not clear yet'}[e.useful]||'—';
  return `<div class="panel eval ${ai?'':'auto'}">
    <div class="eval-top"><div class="big-score"><b>${e.overall}</b><span>/ 5</span></div><div><div class="row" style="gap:8px">${ai?'<span class="chip ai">AI feedback · Gemini</span>':'<span class="chip w">Automatic estimate</span>'}<span class="chip">${LEVELS[e.overall]}</span></div>
     <p class="small muted" style="margin-top:6px">Critical thinking in this task, from 1 to 5. Criteria: five core skills from ${srcLinks(['facione1990'])}.</p></div></div>
    ${!ai&&at.evalErr?`<div class="notice w"><p>${esc(at.evalErr)} The scores below are an automatic estimate. <button type="button" class="btn sm" data-act="eval-retry" data-id="${at.id}" ${at.evalBusy?'disabled':''}>${at.evalBusy?'Asking…':'Try AI feedback again'}</button></p></div>`:''}
    <div class="crit">${COMP.map(c=>`<div class="crit-row"><span><b>${c.name}</b><small class="support-uz">${UZ.crit[c.key]}</small></span>${barsHTML(e.scores[c.key])}<span class="crit-n">${e.scores[c.key]}/5</span></div>`).join('')}</div>
    <div class="cmp2"><div><span class="lbl">At the start you thought</span><p>${esc(e.start||at.d.think.initial)}</p></div><div><span class="lbl">At the end you decided</span><p>${esc(e.end||at.d.decide.final)}</p></div></div>
    <div class="eval-txt"><p><b>What changed:</b> ${esc(e.change)}</p><p><b>Was the task useful for you?</b> ${useful}. ${esc(e.usefulWhy)}</p><p class="eval-concl"><b>Conclusion:</b> ${esc(e.conclusion)}</p>${e.next?`<p><b>Next step:</b> ${esc(e.next)}</p>`:''}</div>
    <p class="small muted">${ai?'AI feedback can contain mistakes. Discuss it with your teacher.':''} This feedback is a learning aid, not a validated test.</p></div>`}
function refreshResult(at){if(ui.page!=='assessment')return;const box=$('#evalBox');if(box&&at&&box.dataset.id===at.id){box.innerHTML=feedbackHTML(at);const b=$('#newBadges');if(b&&(ui.justBadges||[]).length)b.innerHTML=ui.justBadges.map(k=>badgeHTML(k,true)).join('')}}
function viewAssessment(){
  const done=completedList(),at=(S.attempts[ui.assessId]&&S.attempts[ui.assessId].status==='completed')?S.attempts[ui.assessId]:done[done.length-1];
  if(!at)return `<div class="page"><div class="page-head"><h1>Result</h1></div>${empty('No completed task yet','Finish a task to see your AI feedback.',`<button class="btn" data-go="library">Tasks</button>`)}</div>`;
  const t=TASK_BY_ID[at.taskId],d=at.d,jc=ui.justCompleted===at.id,xp=at.result?at.result.xp:0,n=Object.keys(d.check.opened).length;
  return `<div class="page"><div class="page-head"><h1>${jc?'🎉 ':''}Your result</h1><p>Task ${t.num}. ${esc(t.title)} · ${fmtDate(at.completedAt)}${at.sample?' · <span class="chip demo">SAMPLE RECORD</span>':''}</p></div>
   <div class="row" style="gap:8px;margin-bottom:14px;flex-wrap:wrap">${at.sample?'':`<span class="xp-pill big" id="xpGain" data-to="${xp}">⭐ +${jc?0:xp} XP</span>`}<span class="chip ${d.think.pick===t.q1.best?'g':'w'}">Main problem: ${d.think.pick===t.q1.best?'correct':'not the best choice'}</span><span class="chip">${esc((AGREE.find(a=>a[0]===d.check.agree)||[])[1]||'')}</span><span class="chip ${n?'p':''}">Sources checked: ${n} of ${t.statements.length}</span></div>
   <div class="badge-row" id="newBadges" style="margin-bottom:10px">${jc?(ui.justBadges||[]).map(k=>badgeHTML(k,true)).join(''):''}</div>
   <h2>AI feedback on your critical thinking</h2>${uzs(UZ.evalNote)}
   <div id="evalBox" data-id="${at.id}">${feedbackHTML(at)}</div>
   <h2>Evidence-based solution</h2><p class="muted small">A solution for this situation built on the research in the Source Library. Tap a source to read it.</p>
   <ol class="solution">${t.solution.map(s=>`<li>${esc(s.text)} <span class="sol-src">(${srcLinks(s.src)})</span></li>`).join('')}</ol>
   <h2>The AI statements, checked</h2>
   <ol class="stmts done">${t.statements.map((s,i)=>`<li class="stmt opened"><div class="stmt-top"><span class="stmt-n">${i+1}</span><p>${esc(s.text)}</p></div><div class="stmt-src">${verdictPill(s.v)} ${srcLinks(s.src)}</div><p class="small muted">${esc(s.why)}</p></li>`).join('')}</ol>
   <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:18px"><button class="btn" data-act="random-task">🎲 Next task</button><button class="btn ghost" data-go="record" data-id="${at.id}">View record</button><button class="btn ghost" data-go="progress">My progress</button><button class="btn quiet" data-go="library">All tasks</button></div></div>`}

/* ---------- record ---------- */
function viewRecord(){
  const at=S.attempts[ui.params.id];if(!at||at.status!=='completed')return `<div class="page"><div class="page-head"><h1>Record</h1></div>${empty('No record','This record does not exist.',`<button class="btn" data-go="progress">My progress</button>`)}</div>`;
  const r=recordObject(at),QA=(q,a)=>a||a===0?`<div class="qa"><div class="q">${esc(q)}</div><div class="a">${esc(a)}</div></div>`:'',f=r.feedback;
  return `<div class="page"><div class="page-head"><h1>Record: ${esc(r.task.title)}</h1><p>${fmtDate(at.completedAt)} ${at.sample?'· <span class="chip demo">SAMPLE RECORD</span>':''}</p></div>
   <div class="row" style="gap:8px;margin-bottom:16px;flex-wrap:wrap"><button class="btn quiet" data-go="progress">← My progress</button><button class="btn" data-go="assessment" data-id="${at.id}">Result</button><button class="btn ghost" data-act="export" data-kind="json" data-id="${at.id}">JSON</button><button class="btn ghost" data-act="export" data-kind="csv" data-id="${at.id}">CSV</button><button class="btn danger" data-act="delete-record" data-id="${at.id}">Delete</button></div>
   <div class="rec-sec"><h3>1 Think · Contextualize</h3>${QA('Situation',r.task.situation)}${QA('Main problem (your choice)',r.contextualize.mainProblemChoice)}${QA('First opinion',r.contextualize.firstOpinion)}</div>
   <div class="rec-sec"><h3>2 Ask AI · Consult</h3>${r.consult.aiSuggestion.map((s,i)=>QA('Statement '+(i+1),s)).join('')}</div>
   <div class="rec-sec"><h3>3 Check · Critique</h3>${QA('Position',r.critique.position)}${QA('Reason',r.critique.reason)}${QA('Checked sources',r.critique.checkedSources==='yes'?'Yes: statements '+(r.critique.statementsOpened.join(', ')||'none opened'):'No')}</div>
   <div class="rec-sec"><h3>4 Decide · Construct</h3>${QA('Final solution',r.construct.finalSolution)}${QA('Opinion change',r.construct.opinionChange)}</div>
   <div class="rec-sec"><h3>Feedback</h3>${QA('Source',f.source)}${QA('Overall',f.overall+' / 5')}${QA('Scores',COMP.map(c=>c.name+' '+(f.scores?f.scores[c.key]:'–')).join(' · '))}${QA('Conclusion',f.conclusion)}</div></div>`}
/* =====================================================================
   SHARED QUIZ HELPERS (used by Team Competition). The separate Method
   Challenge page was removed in the 4C version.
   ===================================================================== */
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

/* Returns a COPY of a question with its options in random order. The correct
   answer is tracked by position, so it moves together with its option text.
   The shared question bank (MC_QUESTIONS) is never modified. */
function mcShuffleQ(q){
  const perm=shuffle(q.options.map((_,i)=>i));
  return {id:q.id,method:q.method,diff:q.diff,q:q.q,explain:q.explain,
    options:perm.map(i=>q.options[i]),correct:perm.indexOf(q.correct)}}
/* =====================================================================
   TEAM COMPETITION — a classroom quiz for one shared screen, played in TURNS.
   Every question is asked to ONE team (A, B, C, A, B, C ...). The team's answer is
   marked on the screen; the moment it is marked the result is revealed with an
   animation and a short jingle, and only that team scores. A countdown runs for
   every question; when it ends the question counts as unanswered. Reuses the Method Challenge question bank so the
   two features share one source of truth instead of duplicating content.
   ===================================================================== */
const TC_COLORS=['var(--primary)','var(--ai)','var(--warn)','var(--good)'];
const TC_SECONDS=40;   /* seconds per question in Team Competition */

function tcSetMode(n){
  const g=ui.tc,old=g.teams;
  g.mode=n;
  if(n===1){g.teams=[{name:'You',score:0}]}
  else{g.teams=Array.from({length:n},(_,i)=>({name:(old[i]&&old[i].name&&old[i].name!=='You')?old[i].name:`Team ${String.fromCharCode(65+i)}`,score:0}))}
  tcClamp()}

const TC_TOPICS=[['mixed','🔀','Mixed'],['methods','🎓','Methods'],['situations','🏫','Classroom situations'],['grammar','✍️','Grammar']];
const tcTopics=t=>t==='methods'?['methods']:t==='situations'?['situations']:t==='grammar'?['grammar']:['methods','situations','grammar'];
/* Draw `count` questions: a balanced mix of the chosen topics, none repeated until the pool is used up.
   If one difficulty has too few questions, the rest come from the other difficulties of the same topics. */
function tcBuildOrder(diff,count,topic){
  const tp=tcTopics(topic),out=[],base=Math.floor(count/tp.length);let extra=count-base*tp.length;
  shuffle(tp).forEach(t=>{const p=qPool([t],diff),want=base+(extra-->0?1:0);pickQs(p,Math.min(want,p.length)).forEach(q=>out.push(q))});
  if(out.length<count){const ids=new Set(out.map(q=>q.id));shuffle(qPool(tp).filter(q=>!ids.has(q.id))).slice(0,count-out.length).forEach(q=>out.push(q))}
  return shuffle(out).slice(0,count).map(q=>q.id)}

const TC_PER_TEAM=[5,10,20];
const tcTurn=g=>g.idx%g.teams.length;
/* No question may repeat inside one game, so each team can get at most (questions in the topic) / (number of teams). */
const tcMaxPer=g=>Math.floor(qPool(tcTopics(g.topic||'mixed')).length/g.teams.length);
function tcClamp(){const g=ui.tc,max=tcMaxPer(g);if(g.count>max){const ok=TC_PER_TEAM.filter(n=>n<=max);g.count=ok.length?ok[ok.length-1]:Math.max(1,max)}}
const tcTotal=g=>g.count*g.teams.length;

function tcClearTimer(){if(ui.tc.timerId){clearInterval(ui.tc.timerId);ui.tc.timerId=null}}
function tcStartTimer(){
  tcClearTimer();ui.tc.timeLeft=TC_SECONDS;
  ui.tc.timerId=setInterval(()=>{
    ui.tc.timeLeft--;
    const el=$('#tcTimer'),bar=$('#tcBar');
    if(el){el.textContent='⏱ '+Math.max(0,ui.tc.timeLeft)+'s';el.classList.toggle('low',ui.tc.timeLeft<=5)}
    if(bar)bar.style.width=Math.max(0,ui.tc.timeLeft)/TC_SECONDS*100+'%';
    if(ui.tc.timeLeft<=0){tcClearTimer();if(!ui.tc.revealed){tcAnswer(null);render()}}
  },1000)}

function tcStart(){
  const g=ui.tc;
  if(!TC_PER_TEAM.includes(g.count))g.count=5;
  tcClamp();
  g.teams.forEach(t=>{t.score=0;t.correct=0;t.answered=0});
  g.order=tcBuildOrder(g.diff,tcTotal(g),g.topic||'mixed');
  g.qs=g.order.map(id=>mcShuffleQ(MC_QUESTIONS.find(x=>x.id===id)));
  g.idx=0;g.picked=null;g.lastOk=false;g.timedOut=false;g.revealed=false;g.justScored=[];g.phase='play';
  tcStartTimer()}

/* The active team's answer (oi = option index, or null when time ran out). Only that team can score. */
function tcAnswer(oi){
  const g=ui.tc;if(g.revealed)return;tcClearTimer();g.revealed=true;
  const q=g.qs[g.idx],ti=tcTurn(g),t=g.teams[ti];
  g.picked=oi;g.timedOut=oi===null;g.lastOk=oi===q.correct;g.justScored=[];t.answered=(t.answered||0)+1;
  if(g.lastOk){t.score+=10;t.correct=(t.correct||0)+1;g.justScored=[ti]}
  sndPlay(g.timedOut?'tc-timeup':g.lastOk?'tc-correct':'tc-wrong')}

function tcNextRound(){
  const g=ui.tc;g.justScored=[];
  if(g.idx+1<g.order.length){g.idx++;g.picked=null;g.lastOk=false;g.timedOut=false;g.revealed=false;tcStartTimer();sndPlay('tc-turn')}
  else{tcClearTimer();g.phase='done';
    S.competitions.push({ts:Date.now(),mode:g.mode,questionCount:g.order.length,perTeam:g.count,difficulty:g.diff,topic:g.topic||'mixed',results:g.teams.map(t=>({name:t.name,score:t.score}))});
    g.newBadge=(g.mode>=2&&awardBadge('team-player'))?'team-player':null;
    persistNow();sndPlay(g.newBadge?'achievement':'complete')}}

function viewCompetition(){
  const g=ui.tc;
  if(g.phase==='play')return tcPlayHTML();
  if(g.phase==='done')return tcDoneHTML();
  return tcSetupHTML()}

function tcAvailNote(g){
  const tp=tcTopics(g.topic||'mixed'),all=qPool(tp).length,diff=qPool(tp,g.diff).length,total=tcTotal(g);
  return `${g.teams.length>1?`${g.teams.length} teams × ${g.count} questions = ${total} questions in total. `:''}Question bank for this choice: ${all} questions (${diff} at this difficulty). Questions do not repeat until the bank has been used. ${total>diff?'Some extra questions from other difficulties will be added. ':''}No question repeats inside a game, so this choice allows up to ${tcMaxPer(g)} questions per team.`}
function tcSetupHTML(){
  const g=ui.tc;
  return `<div class="page"><div class="game-head"><div><h1>🏆 Team Competition</h1><p class="muted" style="margin:0">A classroom quiz on one screen. Teams play in turns: each question goes to one team, which answers and scores on its own.</p></div>${sndToggleBtn()}</div>
  <div class="tc-setup">
   <div><h3 style="margin-bottom:8px">Who is playing?</h3>
    <div class="tc-choice" role="group" aria-label="Number of teams">
     <button data-act="tc-mode" data-n="1" aria-pressed="${g.mode===1}">👤 Solo</button>
     <button data-act="tc-mode" data-n="2" aria-pressed="${g.mode===2}">👥 2 Teams</button>
     <button data-act="tc-mode" data-n="3" aria-pressed="${g.mode===3}">👥 3 Teams</button>
     <button data-act="tc-mode" data-n="4" aria-pressed="${g.mode===4}">👥 4 Teams</button>
    </div></div>
   ${g.mode>1?`<div><h3 style="margin-bottom:8px">Team names</h3><div class="tc-teams">${g.teams.map((t,i)=>`<label><span class="tc-swatch" style="background:${TC_COLORS[i]}"></span><input type="text" value="${esc(t.name)}" data-team="${i}" maxlength="24" aria-label="Name for team ${i+1}"></label>`).join('')}</div></div>`:''}
   <div><h3 style="margin-bottom:8px">Topic</h3>
    <div class="tc-choice" role="group" aria-label="Topic">${TC_TOPICS.map(([k,ic,l])=>`<button data-act="tc-topic" data-topic="${k}" aria-pressed="${(g.topic||'mixed')===k}">${ic} ${l}</button>`).join('')}</div></div>
   <div><h3 style="margin-bottom:8px">Questions per team</h3>
    <div class="tc-choice" role="group" aria-label="Questions per team">${TC_PER_TEAM.map(n=>{const off=n>tcMaxPer(g);return `<button data-act="tc-count" data-n="${n}" aria-pressed="${g.count===n}" ${off?'disabled title="Not enough different questions in this topic for this many teams"':''}>${n} questions</button>`}).join('')}</div>
    <p class="tiny dim" style="margin-top:6px">${tcAvailNote(g)}</p></div>
   <div><h3 style="margin-bottom:8px">Difficulty</h3>
    <div class="tc-choice" role="group" aria-label="Difficulty">
     <button data-act="tc-diff" data-diff="easy" aria-pressed="${g.diff==='easy'}">🟢 Easy</button>
     <button data-act="tc-diff" data-diff="medium" aria-pressed="${g.diff==='medium'}">🟡 Medium</button>
     <button data-act="tc-diff" data-diff="advanced" aria-pressed="${g.diff==='advanced'}">🔴 Advanced</button>
    </div></div>
   <div><p class="tiny dim" style="margin:0 0 8px">Each question has a ${TC_SECONDS}-second countdown. A correct answer scores 10 points for the team whose turn it is.</p><button class="btn" data-act="tc-start" style="min-height:52px;padding:0 28px;font-size:1.05rem">Start Competition</button></div>
  </div></div>`}

function tcPlayHTML(){
  const g=ui.tc,q=g.qs[g.idx],letters=['A','B','C','D'],n=g.teams.length,ti=tcTurn(g),team=g.teams[ti],nextTeam=g.teams[(g.idx+1)%n],last=g.idx+1>=g.order.length;
  const round=Math.floor(g.idx/n)+1,pctLeft=Math.max(0,g.timeLeft)/TC_SECONDS*100;
  const optCls=oi=>{if(!g.revealed)return'';if(oi===q.correct)return 'correct'+(g.picked===oi?' pop':'');if(g.picked===oi)return 'wrong shake';return 'dim'};
  const verdict=!g.revealed?'':g.timedOut
    ?`<div class="tc-verdict late" role="status"><span class="vi" aria-hidden="true">⏰</span><div><b>Time's up!</b> No points this turn. The correct answer is <b>${letters[q.correct]}</b>.<span>${esc(q.explain)}</span></div></div>`
    :g.lastOk
    ?`<div class="tc-verdict ok" role="status"><span class="vi" aria-hidden="true">✅</span><div><b>Correct! +10 for ${esc(team.name)}</b><span>${esc(q.explain)}</span></div></div>`
    :`<div class="tc-verdict bad" role="status"><span class="vi" aria-hidden="true">❌</span><div><b>Not correct.</b> The right answer is <b>${letters[q.correct]}</b>.<span>${esc(q.explain)}</span></div></div>`;
  return `<div class="page"><div class="game-head"><h1>🏆 Team Competition</h1>${sndToggleBtn()}</div>
  <div class="tc-round"><b>ROUND ${round} / ${g.count}${n>1?` · QUESTION ${g.idx+1} / ${g.order.length}`:''}</b><span class="tc-timer ${g.timeLeft<=5&&!g.revealed?'low':''}" id="tcTimer">⏱ ${Math.max(0,g.timeLeft)}s</span></div>
  <div class="tc-timebar" aria-hidden="true"><i id="tcBar" style="width:${g.revealed?pctLeft:pctLeft}%"></i></div>
  <div class="tc-board">${g.teams.map((t,i)=>`<div class="tc-team ${i===ti?'turn':''}" style="--tc:${TC_COLORS[i%4]}"><div class="nm">${esc(t.name)}${i===ti&&n>1?' <span class="now">PLAYING</span>':''}</div><div class="sc ${g.justScored&&g.justScored.includes(i)?'bump':''}">⭐ ${t.score}${g.justScored&&g.justScored.includes(i)?'<span class="tc-float" aria-hidden="true">+10</span>':''}</div><div class="sub">${t.correct||0} / ${t.answered||0} correct</div></div>`).join('')}</div>
  <div class="tc-turnbanner" style="--tc:${TC_COLORS[ti%4]}"><span aria-hidden="true">🎯</span> <b>${esc(team.name)}</b>${n>1?'<span>, your question</span>':''}</div>
  <div class="mc-card tc-q">
   <p class="mc-scenario">${esc(q.q)}</p>
   <div class="tc-options tc-answers" role="group" aria-label="Answer options for ${esc(team.name)}">${q.options.map((o,oi)=>`<button type="button" class="tc-option ${optCls(oi)}" data-act="tc-answer" data-o="${oi}" ${g.revealed?'disabled':''} aria-label="Option ${letters[oi]}: ${esc(o)}"><b>${letters[oi]}</b><span>${esc(o)}</span></button>`).join('')}</div>
   ${!g.revealed?`<p class="tc-hint tiny dim">Tap the answer ${esc(team.name)} chooses. It is marked immediately.</p>`
    :`${verdict}<div class="row" style="margin-top:18px;justify-content:flex-end"><button class="btn" data-act="tc-next">${last?'See final results':n>1?`Next: ${esc(nextTeam.name)} ▶`:'Next question ▶'}</button></div>`}
  </div></div>`}

function tcDoneHTML(){
  const g=ui.tc,ranked=g.teams.slice().sort((a,b)=>b.score-a.score);
  return `<div class="page"><div class="mc-card tc-final" style="max-width:520px;margin:0 auto">
   <div style="font-size:2.6rem" aria-hidden="true">🏆</div>
   <h2>Competition Complete!</h2>
   <div class="tc-podium">${ranked.map((t,i)=>`<div class="${i===0&&ranked.length>1&&t.score>ranked[ranked.length-1].score?'first':''}">${i===0&&ranked.length>1&&t.score>ranked[ranked.length-1].score?'🏆 ':''}${esc(t.name)}<span>⭐ ${t.score}</span><small class="tc-sub">${t.correct||0} / ${t.answered||0} correct</small></div>`).join('')}</div>
   ${g.newBadge?`<div class="badge-row" style="justify-content:center">${badgeHTML(g.newBadge,true)}</div>`:''}
   <p class="muted">Great effort! Every challenge helps you learn — keep thinking and keep practising.</p>
   <div class="row" style="justify-content:center;margin-top:14px"><button class="btn" data-act="tc-restart">Play again</button><button class="btn quiet" data-go="home">Back to home</button></div>
  </div></div>`}
/* =====================================================================
   APP CONTROLLER
   ===================================================================== */
const VIEWS={home:viewHome,about:viewAbout,cycle:viewCycle,library:viewLibrary,sources:viewSources,competition:viewCompetition,progress:viewProgress,assessment:viewAssessment,record:viewRecord,aichat:viewAIChat};
const PAGE_ALIAS={dashboard:'progress',history:'progress',tasks:'library',methods:'library'};
const HASH_PAGES=['home','about','cycle','library','sources','competition','progress','assessment','aichat'];
const PAGE_TITLES={home:'AI-CT TEACHER',about:'About the project',cycle:'AI-CT 4C cycle',library:'Tasks',sources:'Source Library',competition:'Team Competition',progress:'My progress',assessment:'Result',record:'Record',aichat:'AI Chat'};

function render(keep){
  const y=window.scrollY;renderShell();
  try{$('#main').innerHTML=VIEWS[ui.page]()+footerHTML()}catch(e){console.error(e);$('#main').innerHTML=`<div class="page"><div class="notice b"><p>Something went wrong showing this page. Go to the home page and try again.</p></div></div>`}
  afterRender();window.scrollTo(0,keep?y:0)}
function afterRender(){
  updateLive();updateSaved();
  if(ui.page==='aichat')gchatAfterRender();
  if(ui.page==='sources'&&ui.srcFocus){const k=ui.srcFocus;ui.srcFocus=null;setTimeout(()=>focusSource(k),30)}
  if(ui.page==='assessment'&&ui.justCompleted){
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    [['#xpGain',n=>'⭐ +'+n+' XP']].forEach(([sel,fmt])=>{const el=$(sel);if(!el)return;const to=+el.dataset.to;
      if(reduce){el.textContent=fmt(to);return}
      const t0=performance.now();(function f(t){const k=Math.min(1,(t-t0)/900);el.textContent=fmt(Math.round(to*k));if(k<1)requestAnimationFrame(f)})(t0);setTimeout(()=>{el.textContent=fmt(to)},1100)})}}
function celebrate(){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const box=document.createElement('div');box.className='confetti';box.setAttribute('aria-hidden','true');
  const cols=['#F2C14E','#2B3F8F','#237552','#5A4A98','#A3303F'];
  for(let i=0;i<28;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'%';p.style.background=cols[i%5];p.style.animationDelay=Math.random()*.4+'s';p.style.setProperty('--dx',(Math.random()*160-80)+'px');box.appendChild(p)}
  document.body.appendChild(box);setTimeout(()=>box.remove(),2300)}

/* ---------- routing (hash links work on GitHub Pages: #library, #aichat ...) ---------- */
function parseHash(){const h=(location.hash||'').replace(/^#/,''),p=PAGE_ALIAS[h]||h;return HASH_PAGES.includes(p)?{page:p}:null}
function syncUrl(page){try{document.title=(PAGE_TITLES[page]||'AI-CT TEACHER')+' | AI-CT TEACHER';
  const want=HASH_PAGES.includes(page)?'#'+page:null;if(want&&location.hash!==want)history.pushState(null,'',want)}catch(e){}}
function go(page,params){
  if(page==='aichat'){ui.gchat.err=''}
  page=PAGE_ALIAS[page]||page;params=params||{};
  if(ui.page==='competition'&&page!=='competition')tcClearTimer();
  ui.page=page;ui.params=params;ui.menu=false;syncUrl(page);
  if($('#overlay'))$('#overlay').innerHTML='';
  if(page==='assessment'&&params.id)ui.assessId=params.id;
  if(page!=='assessment'){ui.justCompleted=ui.justCompleted&&page==='record'?ui.justCompleted:null;ui.justBadges=null}
  render();const m=$('#main');m&&m.focus({preventScroll:true});
  if(page==='aichat'&&API.base&&!API.caps.checked)apiCheck().then(()=>{if(ui.page==='aichat')render(true)})}
function openAttempt(at){enterStage(at);go('cycle',{attemptId:at.id})}
function enterStage(at){if(at.stage===2&&at.status==='in_progress'&&!at.d.consult.read){at.d.consult.read=true;touch(at)}}
function rerenderStage(){const at=curAttempt(),m=$('#stageMain');if(!at||!m)return;const y=window.scrollY;m.innerHTML=stageHTML(at);updateLive();window.scrollTo(0,y)}

function updateLive(){
  if(ui.page!=='cycle')return;const at=curAttempt();if(!at)return;
  $$('[data-cnt]').forEach(el=>{const p=el.dataset.cnt,v=getPath(at.d,p),n=W(p==='check.reason'?reasonText(v):v),min=+el.dataset.min;el.classList.toggle('ok',n>=min);el.textContent=min?`${n} / ${min}+ words`:`${n} words`});
  const rq=reqs(at,at.stage),okc=rq.filter(r=>r.ok).length,all=okc===rq.length;
  const sum=$('#reqSum');if(sum){sum.textContent=all?'✓ Ready to continue':`${rq.length-okc} thing${rq.length-okc===1?'':'s'} left before you can continue`;sum.style.color=all?'var(--good)':'var(--warn)'}
  const ul=$('#reqList');if(ul)ul.innerHTML=rq.map(r=>`<li class="${r.ok?'ok':'no'}"><i>${r.ok?'✓':'○'}</i><span>${esc(r.label)}</span></li>`).join('');
  const nb=$('#nextBtn');if(nb)nb.setAttribute('aria-disabled',String(at.stage<4?!all:![1,2,3,4].every(s=>stageOk(at,s))));
  const fe=$('#finalEcho');if(fe)fe.textContent=at.d.decide.final||'…';
  const tl=$('#traceList');if(tl)tl.innerHTML=traceHTML(at);
}
/* ---------- AI service helpers ---------- */
const AI_DOWN='The AI service is temporarily unavailable.';
const AI_BUSY='The AI is busy right now (many requests at the same time). Wait a few seconds, then try again.';
const consultErrText=e=>(e&&(e.status===429||e.code==='rate_limited'))?AI_BUSY:AI_DOWN;
const extraOf=d=>({claims:d.claims_to_check||[],assumptions:d.possible_assumptions||[],uncertainty:d.uncertainty||'',followUp:d.follow_up_question||''});
async function capsReady(retry){
  if(!API.base)return;
  for(let i=0;i<40&&API.caps.checking;i++)await new Promise(r=>setTimeout(r,250));
  if(retry||!API.caps.checked||API.caps.err)await apiCheck(true)}
function refreshAfterCaps(){if(ui.page==='aichat')render(true)}

/* ---------- AI Chat: a free, general conversation with Gemini. Separate from the 4C cycle; nothing is scored. ---------- */
const GCHAT_MAX_Q=600;
function gchatTranscript(newQ){
  const out=[];let budget=2900;
  for(let i=ui.gchat.msgs.length-1;i>=0;i--){
    const m=ui.gchat.msgs[i],t=(m.role==='ai'?'Assistant: ':'Student: ')+String(m.text).replace(/\s+/g,' ').slice(0,m.role==='ai'?700:400);
    if(budget-t.length<0)break;budget-=t.length;out.unshift(t)}
  return (out.length?'Conversation so far:\n'+out.join('\n')+'\n\n':'')+'Student\'s new message: '+newQ}
function gchatAfterRender(){const l=$('#gcLog');if(l&&l.lastElementChild&&l.lastElementChild.scrollIntoView)l.lastElementChild.scrollIntoView({block:'nearest'})}
function gchatCan(){return !!API.base&&API.caps.ai&&!API.caps.err&&!ui.gchat.busy}
function renderGChat(){
  const o=$('#gcLog');if(!o||ui.page!=='aichat')return;
  o.innerHTML=gchatLogHTML();const can=gchatCan();
  [$('#gcIn'),$('#gcSend')].forEach(e=>{if(e)e.disabled=!can});
  $$('.gc-ideas .chip-btn').forEach(b=>{b.disabled=!can});
  const ideas=$('#gcIdeas'),nb=$('#gcNew'),has=ui.gchat.msgs.length>0;if(ideas)ideas.hidden=has;if(nb)nb.hidden=!has;
  gchatAfterRender()}
async function gchatSend(textArg){
  const G=ui.gchat;if(G.busy||!gchatCan())return;
  const inp=$('#gcIn'),text=String(textArg!=null?textArg:(inp?inp.value:'')).replace(/\r/g,'').trim();
  if(!text)return;
  if(text.length>GCHAT_MAX_Q){toast('Please keep a message under '+GCHAT_MAX_Q+' characters');return}
  const transcript=gchatTranscript(text);
  G.err='';G.draft='';G.msgs.push({role:'user',text,ts:Date.now()});G.busy=true;if(inp)inp.value='';sndPlay('stage');renderGChat();
  try{const d=await askBackendChat(transcript);G.msgs.push({role:'ai',text:d.response,ts:Date.now(),extra:extraOf(d)});sndPlay('ai')}
  catch(e){G.msgs.pop();G.draft=text;G.err=consultErrText(e)}
  G.busy=false;renderGChat();const i2=$('#gcIn');if(i2&&G.draft)i2.value=G.draft}

async function copyText(txt){
  try{await navigator.clipboard.writeText(txt);toast('Copied');return}catch(e){}
  try{const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Copied')}catch(e){toast('Select the text and copy it')}}

/* ---------- preferences ---------- */
function applyPrefs(){
  const r=document.documentElement;if(S.prefs.theme)r.dataset.theme=S.prefs.theme;
  if(S.prefs.projector)r.dataset.projector='1';else delete r.dataset.projector}

/* ---------- click handling ---------- */
document.addEventListener('click',async e=>{
  if(e.target.id==='scrim'){ui.menu=false;renderShell();return}
  const el=e.target.closest('[data-go],[data-act],[data-scale]');if(!el)return;
  if(el.getAttribute('aria-disabled')==='true'&&!['stage','next','finish','pick1'].includes(el.dataset.act))return;
  if(el.dataset.go){go(el.dataset.go,el.dataset.id?{id:el.dataset.id}:{});return}
  if(el.dataset.scale){const at=curAttempt();if(!at)return;setPath(at.d,el.dataset.scale,+el.dataset.val);touch(at);$$(`[data-scale="${el.dataset.scale}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b===el)));updateLive();return}
  const a=el.dataset.act,at=curAttempt();
  switch(a){
   case 'menu':ui.menu=!ui.menu;renderShell();break;
   case 'theme':{const cur=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');S.prefs.theme=cur==='dark'?'light':'dark';persist();applyPrefs();break}
   case 'sound':case 'snd-toggle':S.prefs.sound=!sndEnabled();persist();if(sndEnabled())sndPlay('start');render(true);break;
   case 'projector':S.prefs.projector=!S.prefs.projector;persist();applyPrefs();render(true);toast(S.prefs.projector?'Projector mode on: larger text':'Projector mode off');break;
   case 'fullscreen':try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen()}catch(x){toast('Full screen is not available here')}break;
   case 'copy':copyText(el.dataset.text);break;
   case 'about-lang':ui.aboutLang=el.dataset.lang;render(true);break;
   case 'profile-save':{const v=($('#nameIn')||{}).value;if(!setProfileName(v)){toast('Please write a name');break}sndPlay('start');toast('Saved. Salom, '+profileName()+'!');render(true);break}
   case 'random-task':{const ip=latestInProgress();if(ip&&el.closest('.greet')){openAttempt(ip);break}const todo=TASKS.filter(t=>!attemptsFor(t.id).some(x=>x.status==='completed')),pool=todo.length?todo:TASKS,t=pool[Math.floor(Math.random()*pool.length)];sndPlay('start');openAttempt(inProgressFor(t.id)||newAttempt(t.id));break}
   case 'start-task':{const t=el.dataset.task;if(!TASK_BY_ID[t])break;sndPlay('start');openAttempt(inProgressFor(t)||newAttempt(t));break}
   case 'continue':{const x=S.attempts[el.dataset.attempt];if(x)openAttempt(x);break}
   /* --- 4C steps --- */
   case 'pick1':{if(!at||at.d.think.pick>=0)break;at.d.think.pick=+el.dataset.i;touch(at);sndPlay(at.d.think.pick===TASK_BY_ID[at.taskId].q1.best?'correct':'wrong');rerenderStage();break}
   case 'agree':if(at){at.d.check.agree=el.dataset.v;touch(at);$$('[data-act="agree"]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));updateLive()}break;
   case 'source':if(at){const first=at.d.check.source!=='yes'&&el.dataset.v==='yes';at.d.check.source=el.dataset.v;touch(at);rerenderStage();if(first){sndPlay('stage');openSrc(0)}}break;
   case 'change':if(at){at.d.decide.change=el.dataset.v;touch(at);$$('[data-act="change"]').forEach(b=>b.setAttribute('aria-pressed',String(b===el)));updateLive()}break;
   case 'src-stmt':{const i=+el.dataset.seg;if(at&&Number.isInteger(i)&&i>=0)openSrc(i);break}
   case 'src-open':{const seg=el.dataset.seg;if(seg!==undefined&&at&&ui.page==='cycle')openSrc(+seg,el.dataset.src);else openSrc(undefined,el.dataset.src);break}
   case 'src-close':closeSrc();break;
   case 'src-lib':{const k=el.dataset.src;closeSrc();ui.srcQuery='';ui.srcFocus=k;if(ui.page==='sources'){render(true);}else go('sources');break}
   case 'eval-retry':{const x=S.attempts[el.dataset.id];if(x)requestEval(x);break}
   case 'stage':{if(!at)break;const n=+el.dataset.stage;if(n===at.stage)break;if(canEnter(at,n)){at.stage=n;enterStage(at);persistNow();render()}else toast('Complete the earlier steps first. Steps are done in order.');break}
   case 'next':{
     if(!at)break;
     if(!stageOk(at,at.stage)){toast('Complete the checklist to continue');const d=$('.reqs');if(d)d.open=true;break}
     at.stage++;at.maxStage=Math.max(at.maxStage,at.stage);enterStage(at);persistNow();sndPlay('stage');render();break}
   case 'back':if(at&&at.stage>1){at.stage--;persistNow();render()}break;
   case 'later':if(at){persistNow();go('progress');toast('Progress saved. Continue any time.')}break;
   case 'finish':{
     if(!at)break;
     if(at.status==='completed'){go('assessment',{id:at.id});break}
     const bad=[1,2,3,4].find(s=>!stageOk(at,s));
     if(bad){toast(`Step ${bad} (${STAGES[bad-1].student}) is not complete yet`);const d=$('.reqs');if(d)d.open=true;break}
     const res=completeAttempt(at);ui.justCompleted=at.id;ui.justBadges=res.badges;ui.justXp=res.xp;
     sndPlay(res.badges.length?'achievement':'complete');celebrate();go('assessment',{id:at.id});requestEval(at);break}
   /* --- games --- */
   case 'tc-mode':tcSetMode(+el.dataset.n);render();break;
   case 'tc-count':if(+el.dataset.n<=tcMaxPer(ui.tc))ui.tc.count=+el.dataset.n;render(true);break;
   case 'tc-diff':ui.tc.diff=el.dataset.diff;render(true);break;
   case 'tc-topic':ui.tc.topic=el.dataset.topic;tcClamp();render(true);break;
   case 'tc-start':tcStart();sndPlay('start');render();break;
   case 'tc-answer':{const g=ui.tc;if(g.revealed)break;tcAnswer(+el.dataset.o);render();if(g.lastOk)celebrate();break}
   case 'tc-next':tcNextRound();render();break;
   case 'tc-restart':ui.tc={phase:'setup',mode:1,teams:[{name:'You',score:0}],count:5,diff:'easy',topic:'mixed'};render();break;
   /* --- records, data --- */
   case 'sample':{const x=createSample();ui.assessId=x.id;toast('Sample record loaded. It is labelled SAMPLE.');render(true);break}
   case 'export':doExport(el.dataset.kind,el.dataset.id||null);break;
   case 'delete-record':{const ok=await confirmBox('Delete this record?','It will be removed from this device. XP already earned stays.','Delete');if(ok){delete S.attempts[el.dataset.id];S.order=S.order.filter(i=>i!==el.dataset.id);persistNow();go('progress')}break}
   case 'reset':{const ok=await confirmBox('Delete all my data on this device?','This removes your account, records, XP and badges from this device. This cannot be undone.','Delete everything');
     if(ok){try{localStorage.removeItem(KEY)}catch(x){}const p=S.prefs;S=sanitizeState(null);S.prefs=p;persistNow();ui.assessId=null;go('home');toast('All data deleted')}break}
   case 'api-retry':apiCheck(true).then(refreshAfterCaps);render(true);break;
   case 'gc-send':gchatSend();break;
   case 'gc-retry':gchatSend(ui.gchat.draft);break;
   case 'gc-idea':{const i=$('#gcIn');if(i&&!i.disabled){i.value=el.dataset.q;ui.gchat.draft=i.value;i.focus()}break}
   case 'gc-new':ui.gchat={msgs:[],busy:false,err:'',draft:''};render(true);break;
   case 'gc-ask':{const q=el.dataset.q;if(q)gchatSend(q);break}
  }});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('tr[data-act]')){e.preventDefault();e.target.click()}});

/* ---------- input handling (autosave) ---------- */
function onField(e){
  const t=e.target;if(!t||!t.dataset)return;
  if(t.id==='taskQ'){ui.taskQuery=t.value;refreshTaskList();return}
  if(t.id==='srcQ'){ui.srcQuery=t.value;const l=$('#srcList');if(l)l.innerHTML=sourcesListHTML();return}
  if(t.id==='gcIn'){ui.gchat.draft=t.value;return}
  if(t.dataset.b){const at=curAttempt();if(!at||ui.page!=='cycle')return;setPath(at.d,t.dataset.b,t.value);touch(at);updateLive();return}
  if(t.dataset.team!==undefined){const g=ui.tc,i=+t.dataset.team;if(g&&g.teams[i])g.teams[i].name=t.value.slice(0,24)||`Team ${String.fromCharCode(65+i)}`;return}
}
document.addEventListener('input',onField);document.addEventListener('change',onField);
window.addEventListener('beforeunload',()=>{try{persistNow()}catch(e){}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.target&&e.target.id==='gcIn'){e.preventDefault();gchatSend()}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.id==='nameIn'){e.preventDefault();const b=$('[data-act="profile-save"]');b&&b.click()}});

/* ---------- init ---------- */
(function init(){
  applyPrefs();
  /* Browsers only allow sound after the first tap, click or key press, so the welcome chime plays then. */
  let welcomed=false;const welcome=()=>{if(welcomed)return;welcomed=true;if(sndEnabled())sndPlay('welcome')};
  ['pointerdown','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,welcome,{passive:true}));
  const h=parseHash();if(h)ui.page=h.page;
  window.addEventListener('popstate',()=>{const p=parseHash();ui.page=p?p.page:'home';ui.params={};ui.menu=false;render()});
  try{document.title=(PAGE_TITLES[ui.page]||'AI-CT TEACHER')+' | AI-CT TEACHER'}catch(e){}
  render();initCaps();
  apiCheck().then(refreshAfterCaps);
  window.addEventListener('online',()=>apiCheck(true).then(refreshAfterCaps));
  })();
