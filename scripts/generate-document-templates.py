"""Build the editable blank forms; Word PDF export is an offline authoring step.

Runtime API serves the checked-in files and does not require Python or Office.
Usage: python scripts/generate-document-templates.py --export-pdf
"""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, json
from docx import Document
from docx.shared import Mm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'apps/api/assets/document-templates'
STAMP = '2026-11-06'
LINE = '________________________________________'
DATE = '«__» __________________ 20__ г.'
GOST = {'title': 'ГОСТ Р 7.0.97-2025: оформление организационно-распорядительных документов', 'url': 'https://protect.gost.ru/gost/details/360994e3-9a70-47b9-ab3a-cf21809e26ed'}
GUIDANCE = {'title': 'Росархив: рекомендации по применению ГОСТ Р 7.0.97-2025, 2026', 'url': 'https://archives.gov.ru/documents/methodics/met-rek-gost-7-0-97-2025.shtml'}
PRIMARY = {'title': 'ФНС: обязательные реквизиты первичного документа, статья 9 Закона № 402-ФЗ', 'url': 'https://www.nalog.gov.ru/rn57/news/tax_doc_news/5341377/'}


def font(run, size=12, bold=False):
    run.font.name = 'Times New Roman'; run.font.size = Pt(size)
    run.font.bold = bold; run.font.color.rgb = RGBColor(0, 0, 0)
    run._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), 'Times New Roman')


def para(doc, text='', *, bold=False, center=False, indent=True, after=5):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER if center else (WD_ALIGN_PARAGRAPH.LEFT if '_' in text else WD_ALIGN_PARAGRAPH.JUSTIFY)
    p.paragraph_format.first_line_indent = Mm(12.5) if indent and not center else Mm(0)
    p.paragraph_format.space_after = Pt(after)
    font(p.add_run(text), bold=bold)
    return p


def heading(doc, text):
    p = para(doc, text, bold=True, indent=False, after=6)
    p.paragraph_format.space_before = Pt(10); p.paragraph_format.keep_with_next = True
    return p


def field(doc, label, lines=1):
    p = para(doc, label + ': ' + LINE + (('\n' + LINE * 2) * (lines - 1)), indent=False)
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    return p


def table(doc, headers, rows=4, widths=None):
    t = doc.add_table(rows=1, cols=len(headers)); t.autofit = False
    t.style = 'Table Grid'
    if widths:
        for col, width in zip(t.columns, widths): col.width = Mm(width)
    h = t.rows[0]
    repeat = OxmlElement('w:tblHeader'); h._tr.append(OxmlElement('w:trPr')); h._tr.trPr.append(repeat)
    for cell, label in zip(h.cells, headers):
        cell.text = label
        shade = OxmlElement('w:shd'); shade.set(qn('w:fill'), 'F2F2F2'); cell._tc.get_or_add_tcPr().append(shade)
    for _ in range(rows):
        row = t.add_row(); row.height = Mm(9)
        for c in row.cells: c.text = ''
    for ri, row in enumerate(t.rows):
        cant = OxmlElement('w:cantSplit'); row._tr.get_or_add_trPr().append(cant)
        for ci, cell in enumerate(row.cells):
            if widths: cell.width = Mm(widths[ci])
            for p in cell.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                p.paragraph_format.first_line_indent = Mm(0); p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.space_before = Pt(3); p.paragraph_format.line_spacing = 1
                for r in p.runs: font(r, 10.5, ri == 0)
    return t


def signature(doc, roles=('Передал / Исполнитель', 'Принял / Заказчик'), compact=False):
    t = doc.add_table(rows=1, cols=len(roles)); t.autofit = False
    for cell, role in zip(t.rows[0].cells, roles):
        items = [role, 'Должность ______________________', 'Подпись _______________________', 'Фамилия, инициалы ______________', 'Дата __________________________']
        if compact: items = [role, 'Должность / фамилия, инициалы ______________________', 'Подпись __________________  Дата __________________']
        for i, text in enumerate(items):
            p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
            p.paragraph_format.first_line_indent = Mm(0); p.paragraph_format.space_after = Pt(5)
            p.paragraph_format.keep_with_next = i < len(items) - 1
            font(p.add_run(text), 11, i == 0)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)


def requisites(doc, roles=('Арендодатель', 'Арендатор')):
    heading(doc, 'Реквизиты и подписи сторон')
    t = doc.add_table(rows=1, cols=2)
    for cell, role in zip(t.rows[0].cells, roles):
        items = [role, 'Наименование ___________________', 'ИНН / КПП _____________________', 'ОГРН / ОГРНИП _________________', 'Адрес _________________________', 'Банк __________________________', 'БИК ___________________________', 'Расчётный счёт _________________', 'Корр. счёт _____________________', 'Должность _____________________', 'Подпись _______________________', 'Фамилия, инициалы ______________']
        for i, text in enumerate(items):
            p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
            p.paragraph_format.first_line_indent = Mm(0); p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.keep_with_next = i < len(items) - 1
            font(p.add_run(text), 10.5, i == 0)


def fresh(title, landscape=False):
    doc = Document(); sec = doc.sections[0]
    if landscape:
        sec.orientation = WD_ORIENT.LANDSCAPE; sec.page_width = Mm(297); sec.page_height = Mm(210)
    else: sec.page_width = Mm(210); sec.page_height = Mm(297)
    sec.top_margin = Mm(20); sec.bottom_margin = Mm(20); sec.left_margin = Mm(30); sec.right_margin = Mm(15)
    sec.header_distance = Mm(10); sec.footer_distance = Mm(10)
    sec.different_first_page_header_footer = True
    normal = doc.styles['Normal']; normal.font.name = 'Times New Roman'; normal.font.size = Pt(12)
    normal.paragraph_format.line_spacing = 1.15; normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.widow_control = True
    for name in ['Title', 'Heading 1', 'Heading 2', 'Heading 3']:
        s = doc.styles[name]; s.font.name = 'Times New Roman'; s.font.size = Pt(12)
        s.font.color.rgb = RGBColor(0, 0, 0)
    header = sec.header.paragraphs[0]; header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE'); header._p.append(fld)
    props = doc.core_properties; props.title = title; props.author = 'Склад Контур'
    props.subject = 'Незаполненная форма'; props.keywords = 'шаблон, бланк, Склад Контур'
    props.created = datetime(2026, 11, 6); props.modified = datetime(2026, 11, 6)
    para(doc, 'Наименование организации / ИП: ' + LINE, indent=False, after=14)
    para(doc, title.upper(), bold=True, center=True, after=10)
    para(doc, '№ ____________     ' + DATE, center=True, after=8)
    return doc


def lease():
    d = fresh('Договор аренды нежилого помещения')
    para(d, 'Место заключения: ' + LINE, indent=False)
    para(d, 'Арендодатель ' + LINE + ', в лице ' + LINE + ', действующего на основании ' + LINE + ', и Арендатор ' + LINE + ', в лице ' + LINE + ', действующего на основании ' + LINE + ', заключили настоящий договор о нижеследующем.')
    heading(d, '1. Предмет договора')
    para(d, 'Арендодатель передаёт, а Арендатор принимает во временное владение и пользование нежилое помещение, определённое следующими сведениями:')
    for label in ['Адрес объекта', 'Корпус, этаж, номер помещения', 'Кадастровый номер / описание границ', 'Площадь, м²', 'Назначение использования', 'Документ — основание права Арендодателя']: field(d, label)
    para(d, 'План помещения: приложение № ______ на ______ листах. Состояние и комплектность фиксируются актом приёма-передачи.')
    heading(d, '2. Срок и порядок передачи')
    field(d, 'Срок аренды, с / по'); field(d, 'Дата передачи и порядок доступа')
    field(d, 'Условия продления / прекращения')
    heading(d, '3. Арендная плата и расчёты')
    for label in ['Размер платы, руб. в месяц / руб. за м²', 'НДС: ставка и сумма либо основание применения без НДС', 'Срок и порядок оплаты', 'Коммунальные и эксплуатационные платежи', 'Обеспечительный платёж и условия возврата', 'Индексация: основание, период и порядок уведомления']: field(d, label)
    heading(d, '4. Содержание, эксплуатация и ответственность')
    para(d, 'Стороны определяют обязанности по содержанию и ремонту помещения, допуску к инженерным системам и соблюдению назначения использования.')
    for label in ['Обязанности Арендодателя', 'Обязанности Арендатора', 'Текущий / капитальный ремонт и согласование работ', 'Ответственность сторон и порядок уведомления', 'Порядок возврата помещения']: field(d, label)
    heading(d, '5. Дополнительные условия и приложения')
    field(d, 'Условия досрочного расторжения и разрешения разногласий', 2)
    field(d, 'Дополнительные условия', 2)
    para(d, 'Приложения: план помещения; акт приёма-передачи; ' + LINE, indent=False)
    requisites(d)
    return d


def addendum():
    d = fresh('Дополнительное соглашение к договору аренды')
    field(d, 'Договор аренды: номер и дата'); field(d, 'Арендодатель'); field(d, 'Арендатор')
    para(d, 'Стороны договорились внести следующие изменения в указанный договор аренды:')
    table(d, ['Пункт договора', 'Прежняя редакция / условие', 'Новая редакция / условие'], rows=4, widths=[25, 70, 70])
    field(d, 'Дата вступления изменений в силу'); field(d, 'Порядок перерасчёта, если требуется')
    para(d, 'Иные условия договора, не затронутые настоящим соглашением, сохраняют действие. Настоящее соглашение является частью договора.')
    field(d, 'Приложения'); requisites(d)
    return d


def handover():
    d = fresh('Акт приёма-передачи нежилого помещения')
    for label in ['Основание: договор, номер и дата', 'Передающая сторона', 'Принимающая сторона', 'Адрес, корпус, этаж, номер', 'Кадастровый номер / границы', 'Площадь, м²', 'Дата и время фактической передачи']: field(d, label)
    heading(d, 'Состояние, комплектность и замечания')
    table(d, ['Элемент / система', 'Состояние при передаче', 'Замечание / срок устранения'], rows=3, widths=[50, 55, 60])
    heading(d, 'Ключи, доступ и документы')
    table(d, ['Наименование', 'Количество / номер', 'Примечание'], rows=2, widths=[70, 40, 55])
    heading(d, 'Показания приборов на дату передачи')
    table(d, ['Ресурс, место установки', 'Заводской номер', 'Показание и единица'], rows=1, widths=[65, 45, 55])
    field(d, 'Приложения: фото, дефектная ведомость, план')
    field(d, 'Заявления и замечания сторон')
    signature(d, ('Передающая сторона', 'Принимающая сторона'))
    return d


def defects():
    d = fresh('Дефектная ведомость')
    for label in ['Основание осмотра / заявка', 'Объект, помещение, оборудование', 'Дата и время осмотра', 'Состав комиссии / участники']: field(d, label)
    table(d, ['№', 'Дефект, место и проявление', 'Объём, ед.', 'Мера / работа', 'Срок и ответственный'], rows=6, widths=[10, 55, 25, 40, 35])
    field(d, 'Ограничения эксплуатации / меры до устранения', 2)
    field(d, 'Приложения: фото, схема, результаты обследования')
    signature(d, ('Осмотр провёл', 'Ведомость согласовал'))
    return d


def request():
    d = fresh('Заявка на техническое обслуживание')
    for label in ['Заявитель, организация / ИП', 'Договор / лицевой счёт', 'Контактное лицо, телефон', 'Объект, помещение', 'Оборудование / прибор, если относится']: field(d, label)
    heading(d, 'Описание обращения')
    field(d, 'Неисправность / требуемая работа', 3)
    field(d, 'Когда обнаружено, условия проявления')
    field(d, 'Желаемый срок и время доступа')
    field(d, 'Приложения: фото, файлы')
    signature(d, ('Заявитель', 'Заявку принял'))
    return d


def work_order():
    d = fresh('Наряд-задание на выполнение работ')
    for label in ['Основание: заявка / план ППР', 'Объект, помещение, оборудование', 'Исполнитель / бригада', 'Руководитель работ', 'Плановый срок начала / окончания']: field(d, label)
    table(d, ['№', 'Работа / операция', 'Ед.', 'Объём', 'Отметка о выполнении'], rows=5, widths=[10, 75, 15, 20, 45])
    field(d, 'Условия доступа и согласования')
    field(d, 'Ссылки на технологическую и эксплуатационную документацию')
    field(d, 'Фактическое начало / окончание')
    field(d, 'Результат / замечания')
    signature(d, ('Задание выдал', 'Задание получил / выполнил'))
    return d


def estimate():
    d = fresh('Смета на выполнение работ и оказание услуг')
    for label in ['Заказчик', 'Исполнитель', 'Основание: договор / заявка', 'Объект и состав работ', 'Срок выполнения']: field(d, label)
    table(d, ['№', 'Работа / материал / услуга', 'Ед.', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'], rows=7, widths=[9, 65, 15, 20, 27, 29])
    for label in ['Итого без НДС, руб.', 'НДС: ставка / основание, сумма, руб.', 'Всего к оплате, руб. и прописью', 'Срок действия предложения', 'Условия оплаты и включённые расходы', 'Приложения и исключения']: field(d, label)
    signature(d, ('Составил / Исполнитель', 'Согласовал / Заказчик'))
    return d


def service_act():
    d = fresh('Акт выполненных работ / оказанных услуг')
    for label in ['Заказчик: наименование, ИНН / КПП', 'Исполнитель: наименование, ИНН / КПП', 'Основание: договор, номер и дата', 'Объект, помещение / заявка', 'Период выполнения работ / оказания услуг']: field(d, label)
    table(d, ['№', 'Содержание работ / услуг', 'Ед.', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'], rows=5, widths=[9, 65, 15, 20, 27, 29])
    for label in ['Стоимость без НДС, руб.', 'НДС: ставка / основание, сумма, руб.', 'Всего, руб. и прописью', 'Результат, замечания / их отсутствие', 'Приложения: результат, фото, отчёт']: field(d, label)
    para(d, 'Стороны подтверждают указанные в акте объём и результат работ / услуг с учётом зафиксированных замечаний.')
    signature(d, ('Сдал / Исполнитель', 'Принял / Заказчик'))
    return d


def meter_commissioning():
    d = fresh('Акт ввода в эксплуатацию / замены прибора учёта')
    for label in ['Организация, выполняющая ввод / замену', 'Собственник / потребитель', 'Объект, помещение, место установки', 'Основание работ и дата выполнения', 'Ресурс и единица измерения']: field(d, label)
    table(d, ['Сведения о приборе', 'Снимаемый прибор', 'Устанавливаемый прибор'], rows=0, widths=[60, 52, 53])
    t = d.tables[-1]
    for label in ['Тип, марка, модель', 'Заводской номер', 'Показание на дату снятия / ввода', 'Дата поверки / документ', 'Дата следующей поверки', 'Номер пломбы / сведения о пломбировании']:
        row = t.add_row(); row.cells[0].text = label
        for c in row.cells:
            for p in c.paragraphs:
                p.paragraph_format.space_after = Pt(5); p.paragraph_format.space_before = Pt(5)
                for r in p.runs: font(r, 10.5)
    field(d, 'Состояние прибора и результат проверки установки')
    field(d, 'Приложения: паспорт изготовителя, сведения о поверке, фото')
    signature(d, ('Ввод / замену выполнил', 'Прибор принял'))
    return d


def meter_readings():
    d = fresh('Акт снятия показаний приборов учёта')
    for label in ['Организация / ИП', 'Объект, помещение', 'Потребитель / договор / лицевой счёт', 'Расчётный период', 'Дата и время снятия показаний']: field(d, label)
    table(d, ['Ресурс / прибор, заводской №', 'Ед.', 'Предыдущее показание', 'Текущее показание', 'Разность'], rows=4, widths=[60, 15, 30, 30, 30])
    field(d, 'Условия снятия, доступ и состояние пломб')
    field(d, 'Фото и иные приложения')
    field(d, 'Отклонения / разногласия и пояснения', 2)
    signature(d, ('Показания снял', 'Показания подтвердил'))
    return d


def reconciliation():
    d = fresh('Акт сверки взаимных расчётов')
    for label in ['Сторона 1: наименование, ИНН / КПП', 'Сторона 2: наименование, ИНН / КПП', 'Договор / лицевой счёт', 'Период сверки, с / по', 'Валюта расчётов']: field(d, label)
    para(d, 'Сверка проведена по данным сторон. Знак и принадлежность остатка указываются в итоговой строке.')
    table(d, ['Дата', 'Документ / операция', 'Дебет стороны 1', 'Кредит стороны 1', 'Дебет стороны 2', 'Кредит стороны 2'], rows=8, widths=[20, 49, 24, 24, 24, 24])
    for label in ['Сальдо на начало: сумма и в пользу какой стороны', 'Обороты за период', 'Сальдо на конец: сумма и в пользу какой стороны', 'Расхождения и подтверждающие документы']: field(d, label)
    signature(d, ('От стороны 1', 'От стороны 2'))
    return d


def invoice():
    d = fresh('Счёт на оплату')
    for label in ['Поставщик / Исполнитель: наименование, ИНН / КПП', 'Адрес, телефон / электронная почта', 'Покупатель / Заказчик: наименование, ИНН / КПП', 'Основание: договор / заявка', 'Банк получателя', 'БИК', 'Расчётный счёт получателя', 'Корреспондентский счёт']: field(d, label)
    table(d, ['№', 'Товар / работа / услуга', 'Ед.', 'Кол-во', 'Цена, руб.', 'Сумма, руб.'], rows=4, widths=[9, 65, 15, 20, 27, 29])
    for label in ['Итого без НДС, руб.', 'НДС: ставка / основание, сумма, руб.', 'Всего к оплате, руб. и прописью', 'Назначение платежа', 'Срок и условия оплаты']: field(d, label)
    signature(d, ('Счёт выставил', 'Ответственный за оформление'))
    return d


def equipment():
    d = fresh('Карточка оборудования')
    for label in ['Организация / ИП', 'Объект, корпус, этаж, помещение', 'Наименование оборудования', 'Изготовитель, модель / тип', 'Заводской и инвентарный номера', 'Дата изготовления / ввода в эксплуатацию', 'Ответственный за эксплуатацию', 'Гарантийный срок / условия', 'Документ-основание установки']: field(d, label)
    heading(d, 'Документация и эксплуатационные сведения')
    table(d, ['Документ / параметр', 'Номер, дата / значение', 'Место хранения / файл'], rows=4, widths=[55, 50, 60])
    field(d, 'Регламент обслуживания / график ППР')
    field(d, 'Сведения о ремонтах и изменениях')
    field(d, 'Примечания')
    signature(d, ('Карточку составил', 'Ответственный принял'))
    return d


def maintenance():
    d = fresh('График планово-предупредительного ремонта', landscape=True)
    for label in ['Объект / подразделение', 'Период / год', 'Основание: регламент, паспорт, инструкция']: field(d, label)
    table(d, ['Оборудование / место', 'Работа / операция', 'Периодичность', 'Плановая дата', 'Исполнитель', 'Факт: дата / результат'], rows=5, widths=[57, 60, 30, 30, 35, 40])
    field(d, 'Условия доступа, зависимости и ограничения')
    field(d, 'Приложения: регламенты, перечень материалов')
    signature(d, ('График составил', 'График утвердил'), compact=True)
    return d


SPECS = [
 ('lease-agreement', 'Договор аренды нежилого помещения', 'contract', ['properties','buildings','units','leases'], 'Объект, срок, плата, эксплуатационные условия, реквизиты и подписи сторон.', lease),
 ('lease-addendum', 'Дополнительное соглашение', 'contract', ['units','leases'], 'Изменения согласованных условий договора и дата их действия.', addendum),
 ('unit-handover', 'Акт приёма-передачи помещения', 'act', ['properties','buildings','units','leases'], 'Состояние помещения, замечания, ключи, документы и показания при передаче.', handover),
 ('defect-report', 'Дефектная ведомость', 'act', ['properties','buildings','units','equipment','tickets'], 'Дефекты, объём, меры, сроки, ответственные и подтверждающие материалы.', defects),
 ('service-request', 'Заявка на обслуживание', 'other', ['properties','units','leases','tickets','equipment'], 'Заявитель, контакты, объект, описание неисправности и условия доступа.', request),
 ('work-order', 'Наряд-задание', 'instruction', ['properties','buildings','units','equipment','tickets'], 'Перечень работ, исполнители, сроки и отметки выполнения; без подмены наряда-допуска.', work_order),
 ('work-estimate', 'Смета работ и услуг', 'other', ['properties','units','leases','tickets','equipment'], 'Работы, материалы, объёмы, стоимость, НДС и согласование сторон.', estimate),
 ('service-act', 'Акт выполненных работ / услуг', 'act', ['leases','personal_accounts','tickets','equipment'], 'Содержание и период работ, натуральное и денежное измерение, приёмка и подписи.', service_act),
 ('meter-commissioning', 'Акт ввода / замены прибора', 'act', ['properties','units','meters','tickets'], 'Старый и новый приборы, номера, показания, поверка, пломбы и приёмка.', meter_commissioning),
 ('meter-readings', 'Акт снятия показаний', 'act', ['units','meters','personal_accounts','tickets'], 'Период, прибор, прежнее и новое значения, разность, фото и подтверждение.', meter_readings),
 ('reconciliation-act', 'Акт сверки взаимных расчётов', 'act', ['leases','personal_accounts'], 'Операции обеих сторон, начальное и конечное сальдо, разногласия и подписи.', reconciliation),
 ('payment-invoice', 'Счёт на оплату', 'other', ['leases','personal_accounts','tickets'], 'Поставщик, покупатель, банковские реквизиты, позиции и сумма к оплате.', invoice),
 ('equipment-card', 'Карточка оборудования', 'other', ['properties','buildings','units','equipment'], 'Паспортные сведения, ответственное лицо, ссылки на документацию и обслуживание.', equipment),
 ('maintenance-schedule', 'График ППР', 'instruction', ['properties','buildings','equipment','tickets'], 'Оборудование, работы, периодичность, плановые даты, исполнитель и результат.', maintenance),
]


def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()


def export_pdfs(paths):
    import win32com.client, win32process, win32api, win32con
    def pids():
        found = set()
        for pid in win32process.EnumProcesses():
            try:
                handle = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ, False, pid)
                try:
                    if Path(win32process.GetModuleFileNameEx(handle, 0)).name.lower() == 'winword.exe': found.add(pid)
                finally: handle.Close()
            except Exception: pass
        return found
    before = pids(); app = win32com.client.DispatchEx('Word.Application'); created = pids() - before
    if len(created) != 1: raise RuntimeError('Cannot identify a separate Word process; leave existing sessions unchanged')
    report = ROOT / '.local/doc-templates-20261106/word-export.json'; report.parent.mkdir(parents=True, exist_ok=True)
    opened = None; records = []
    try:
        app.Visible = False; app.DisplayAlerts = 0; app.AutomationSecurity = 3
        for p in paths:
            opened = app.Documents.Open(str(p), ReadOnly=True, AddToRecentFiles=False, ConfirmConversions=False)
            opened.ExportAsFixedFormat(str(p.with_suffix('.pdf')), 17)
            pages = int(opened.ComputeStatistics(2)); opened.Close(False); opened = None
            records.append({'id':p.stem,'pages':pages,'docxSha256':sha(p),'pdfSha256':sha(p.with_suffix('.pdf'))})
            print(json.dumps({'exported':p.stem,'pages':pages}))
    finally:
        if opened is not None: opened.Close(False)
        app.Quit(False)
        report.write_bytes((json.dumps({'wordVersion':'16.0','createdPids':sorted(created),'existingPidsUntouched':sorted(before),'documents':records},ensure_ascii=False,indent=2)+'\n').encode('utf-8'))


def build_catalog():
    import pymupdf
    items = []
    for id_, title, category, entities, description, _ in SPECS:
        if not all((DEST / f'{id_}.{fmt}').exists() for fmt in ['docx','pdf']): continue
        files = []
        for fmt, mime in [('pdf','application/pdf'),('docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document')]:
            p = DEST / f'{id_}.{fmt}'
            filename_title = title.replace(' / ', ' и ').replace('/', ' — ')
            item = {'format':fmt,'filename':f'{filename_title} — бланк.{fmt}','asset':p.name,'mimeType':mime,'sizeBytes':p.stat().st_size,'sha256':sha(p)}
            if fmt == 'pdf':
                with pymupdf.open(p) as pdf: item['pages'] = len(pdf)
            files.append(item)
        items.append({'id':id_,'title':title,'description':description,'category':category,'entityTypes':entities,'formType':'blank','legalStatus':'recommended','version':STAMP,'formattingBasis':'ГОСТ Р 7.0.97-2025','legalBasis':[GOST,GUIDANCE]+([PRIMARY] if id_ in ['service-act','work-estimate','payment-invoice','reconciliation-act','meter-readings'] else []),'files':files})
    catalog={'version':STAMP,'formType':'blank','description':'Незаполненные организационные формы. Реквизиты и условия заполняются и утверждаются организацией перед использованием.','items':items}
    (DEST/'catalog.json').write_bytes((json.dumps(catalog,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'catalogForms':len(items),'files':sum(len(i['files']) for i in items)}))


def main():
    p = argparse.ArgumentParser(); p.add_argument('--only',choices=[s[0] for s in SPECS]);p.add_argument('--export-pdf',action='store_true');a=p.parse_args()
    DEST.mkdir(parents=True,exist_ok=True); paths=[]
    for id_, title, category, entities, description, build in SPECS:
        if a.only and id_ != a.only: continue
        doc=build(); out=DEST/f'{id_}.docx';doc.save(out);paths.append(out)
    if a.export_pdf: export_pdfs(paths)
    build_catalog()


if __name__ == '__main__': main()
