import sys, json, fitz, warnings
warnings.filterwarnings('ignore')
raw, out = sys.argv[1], sys.argv[2]
d = fitz.open(raw + '/NSCI 3250 Syllabus and Schedule 2026.pdf')
txt = '\n\f\n'.join(p.get_text() for p in d)
open(out + '/syllabus.txt', 'w', encoding='utf-8').write(txt)
S = []
def row(date, lec, lab, **kw):
    r = dict(date=date, lecture=lec, lab=lab); r.update(kw); S.append(r)
def L(n, t): return dict(number=n, topic=t)
U1, U2, U3 = 'Unit 1: Overview, Nerves, and the Spinal Cord', 'Unit 2: The Brainstem', 'Unit 3: The Cerebrum'
row('2026-01-13', dict(number=None, topic='Course Introduction and lab tour'), dict(number=None, topic='No Lab; Complete Online Lab Training Module'), unit=1)
row('2026-01-15', L(1, 'Embryological Development of the Nervous System and Neurohistology'), L(1, 'Anatomical Terminology, Whole Brain, Meninges, & Skull'), unit=1)
row('2026-01-20', L(2, 'CSF and the Ventricular System; Cerebrum'), L(2, 'Ventricular System, Cerebrum, Diencephalon'), unit=1, quiz_due=1)
row('2026-01-22', L(3, 'Introduction to Cortex'), L(3, 'Functional Anatomy of the Cerebrum'), unit=1)
row('2026-01-27', L(4, 'Peripheral Nerves and Spinal Cord Organization'), L(4, 'Spinal Cord Anatomy and Peripheral Nerves'), unit=1, quiz_due=2)
row('2026-01-29', L(5, 'Sensory Pathways of the Spinal Cord'), L(5, 'Sensory Pathways of the Spinal Cord'), unit=1)
row('2026-02-03', L(6, 'Somatic and Autonomic Motor Systems'), dict(number=6, topic='Optional: Lab Open for Review', optional=True), unit=1, quiz_due=3)
row('2026-02-05', dict(number=None, topic='Written Exam 1', exam=True), dict(number=None, topic='Practical Exam 1', exam=True), unit=1, discussion_board_due=True, exam_unit=1)
row('2026-02-10', L(7, 'Brainstem Overview'), L(7, 'Gross Anatomy of the Brainstem'), unit=2)
row('2026-02-12', L(8, 'Cranial Nerves and Cranial Nerve Nuclei'), L(8, 'Microscopic Anatomy of the Brainstem'), unit=2)
row('2026-02-17', L(9, 'Somatosensory Pathways of the Brainstem'), L(9, 'Sensory Pathways of the Brainstem'), unit=2, quiz_due=4)
row('2026-02-19', L(10, 'Motor systems of the Brainstem'), L(10, 'Motor Pathways of the Brainstem'), unit=2)
row('2026-02-24', L(11, 'Visual System'), L(11, 'Eye; Visual Pathways of the Brainstem'), unit=2, quiz_due=5)
row('2026-02-26', dict(number=12, topic='Brainstem Circuitry and Cranial nerve testing (class may be held remotely on this day)'), dict(number=12, topic='Optional: Lab Open for Review', optional=True), unit=2)
row('2026-03-03', dict(number=None, topic='No Class: Town Meeting Day'), dict(number=None, topic='No Lab: Town Meeting Day'), unit=2, quiz_due=6, no_class=True)
row('2026-03-05', dict(number=None, topic='Written Exam 2', exam=True), dict(number=None, topic='Practical Exam 2', exam=True), unit=2, discussion_board_due=True, exam_unit=2)
row('2026-03-09/2026-03-13', dict(number=None, topic='No Class: Spring Recess'), dict(number=None, topic='No Lab: Spring Recess'), unit=None, no_class=True)
row('2026-03-17', L(13, 'Cerebral Cortex and Cortical Circuitry'), L(13, 'CNS Anatomy: Horizontal Sections'), unit=3)
row('2026-03-19', L(14, 'Motor Control- Basal Ganglia and Cerebellum'), L(14, 'CNS Anatomy: Coronal Sections'), unit=3)
row('2026-03-24', L(15, 'Olfaction and the Limbic System'), L(15, 'Practice: Horizontal and Coronal Sections'), unit=3, quiz_due=7)
row('2026-03-26', L(16, 'Blood Supply to the CNS'), L(16, 'Blood Supply'), unit=3)
row('2026-03-31', L(17, 'Imaging the Brain'), L(17, 'Imaging the Brain'), unit=3, date_note='The syllabus prints "April 31" (not a real date; presumably Tuesday March 31).')
row('2026-04-02', L(18, 'Vessel Disease and Stroke Scenarios'), L(18, 'Brain & CNS Pathology'), unit=3, quiz_due=8)
row('2026-04-07', L(19, 'Enteric Nervous System & Gut-Brain Axis'), dict(number=19, topic='Optional: Lab Open for Review', optional=True), unit=3)
row('2026-04-09', dict(number=20, topic='Optional: Review Class', optional=True), dict(number=20, topic='Optional: Lab Open for Review', optional=True), unit=3, quiz_due=9)
row('2026-04-14', dict(number=None, topic='Written Exam 3', exam=True), dict(number=None, topic='Practical Exam 3', exam=True), unit=3, discussion_board_due=True, exam_unit=3)
doc = dict(
  course=dict(code='NSCI 3250', title='Human Neuroanatomy', crn='10807', term='Spring 2026', institution='University of Vermont',
    lecture='Tuesday and Thursday 8:30-9:45 AM, Aiken Hall Room 110',
    lab_sections={'A01': 'Tue/Thu 10:05-11:20 AM, Given Bldg. Room E401', 'A02': 'Tue/Thu 1:15-2:30 PM, Given Bldg. Room E401'},
    description='Basic and complex anatomy of the central and peripheral nervous systems in health and disease; lecture plus laboratory with real human specimens.',
    objectives=['Describe the anatomy of the central and peripheral nervous systems and how this relates to human behavior.',
                'Extrapolate relationships between structure and function to the effects of localized anatomical injury and understand the presentation of common neurological deficits.']),
  instructors=dict(course_and_lab_director='Estelle "Stellie" Bishop, Ph.D.', email='Estelle.Bishop@uvm.edu', office='Given C454A',
    tas=['Adam Crawford', 'Shahriar Akhavan Tafti']),
  units={'1': U1, '2': U2, '3': U3},
  exam_dates=dict(unit1=dict(written='2026-02-05', practical='2026-02-05'), unit2=dict(written='2026-03-05', practical='2026-03-05'), unit3=dict(written='2026-04-14', practical='2026-04-14')),
  schedule=S,
  grading=dict(
    weights={'three_examinations': '75% (25% each; each exam 50% written / 50% practical)', 'weekly_brightspace_quizzes': '15% (9 quizzes, lowest dropped, 8 count; late = 50% deduction)', 'discussion_boards': '5% (1 original post per unit, 5-10 sentences)', 'attendance_participation': '5%', 'penalty': '-5% of final grade for missing more than 4 lab/lecture sessions unexcused'},
    written_exam='75-minute written exam during lecture time, 30-40 questions (multiple choice, matching, fill-in-the-blank, drawing, essay), Brightspace Lockdown Browser.',
    practical_exam='75-minute practical during lab time, 40 questions at timed stations: identify structures on pinned specimens plus short answers on their function, connectivity, or cellular traits.',
    practice_practical='A brief practice practical is available before each exam.',
    cumulative='Not technically cumulative, but expected to retain and use earlier material.',
    letter_scale={'A+': '97-100%', 'A': '93-96%', 'A-': '90-92%', 'B+': '87-89%', 'B': '83-86%', 'B-': '80-82%', 'C+': '77-79%', 'C': '73-76%', 'C-': '70-72%', 'D+': '67-69%', 'D': '63-66%', 'D-': '60-62%', 'F': 'below 60%'}),
  policies=dict(
    attendance='Required in lecture and lab (sign-in sheet for lab except optional days). Missing more than 4 without timely excuse = -5% final grade.',
    exam_absence="Absence from an exam without Dean's office documentation = zero.",
    lab_rules=['Gloves always; closed-toe shoes, long sleeves/pants', 'No cell phones or cameras; no photographs in lab, do not share instructor images', 'No food or drink in lab', 'No backpacks/coats in lab (lockers provided)', 'Lab open only during scheduled sessions', 'Respect donors (Anatomical Gift Program)'],
    required_trainings='Gross Anatomy Lab Safety Training and Working Safely with Formaldehyde (UVM Risk Management).',
    resources='Brightspace (NSCI3250A). No textbook to buy; Snell Clinical Neuroanatomy 7th ed. pages on Brightspace; atlas used in class: Structure of the Human Brain - a Photographic Atlas (DeArmond, Fusco, Dewey, 3rd ed.). Current year slides contain tested material.',
    study_tips=['Do not get behind; neuroanatomy is like a language', 'Lecture and lab handouts cover all tested material', 'Use the Unit Structure Lists', 'Anatomy is visuo-spatial: label images, draw, make concept maps'],
    academic_integrity='Cheating or collusion = zero and referral to the University.',
    quizzes='Weekly Brightspace quizzes due 8:30 am Tuesdays, open notebook.'),
  notes=['Unit 1 = lectures 1-6 / labs 1-5 (6 optional); Unit 2 = lectures 7-12 / labs 7-11 (12 optional); Unit 3 = lectures 13-19 (20 optional review) / labs 13-17.'])
json.dump(doc, open(out + '/syllabus.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(len(S), 'schedule rows')
