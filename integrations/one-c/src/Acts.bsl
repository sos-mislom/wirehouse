Procedure CreateServiceActDraft(SourceId, Environment, Data)
    SettingsRow = Record("WH_Finance", SourceId, "AccountExternalId", Data.accountExternalId);
    If Not SettingsRow.Selected() Then Return; EndIf;
    Settings = Decode(SettingsRow.Payload);
    If Not Settings.createActs Then Return; EndIf;
    Link = Record("WH_ActDocuments", SourceId, "ActId", Data.actId);
    If Link.Selected() Then Raise "ACT_DOCUMENT_CONFLICT"; EndIf;
    Account = Record("WH_Accounts", SourceId, "ExternalId", Data.accountExternalId);
    Contract = NativeContract(Account.LeaseExternalId);
    Org = Catalogs["Организации"].GetRef(New UUID(Settings.organizationId));
    Nom = Catalogs["Номенклатура"].GetRef(New UUID(Settings.nomenclatureId));
    If Nom.GetObject() = Undefined Or Nom.DeletionMark Then Raise "NOMENCLATURE_NOT_CONFIGURED"; EndIf;
    Currency = Contract["ВалютаВзаиморасчетов"];
    If Currency.IsEmpty() Then Raise "CURRENCY_NOT_CONFIGURED"; EndIf;
    Doc = Documents["РеализацияТоваровУслуг"].CreateDocument();
    Doc.Date = ISODate(Data.date) + 12 * 3600;
    Doc["Организация"] = Org;
    Doc["Контрагент"] = Contract.Owner;
    Doc["ДоговорКонтрагента"] = Contract.Ref;
    Doc["ВалютаДокумента"] = Currency;
    Doc["СуммаВключаетНДС"] = False;
    Doc["СуммаДокумента"] = Data.total;
    Doc["ВидОперации"] = Enums["ВидыОперацийРеализацияТоваров"]["Услуги"];
    Doc["СчетУчетаРасчетовСКонтрагентом"] = ChartsOfAccounts["Хозрасчетный"].FindByCode(Settings.settlementAccount);
    Doc["СчетУчетаРасчетовПоАвансам"] = ChartsOfAccounts["Хозрасчетный"].FindByCode("62.02");
    Doc["Комментарий"] = "Wirehouse " + SourceId + " / " + Data.actId + " / " + Data.number;
    For Each Input In Data.lines Do
        Line = Doc["Услуги"].Add();
        Line["Номенклатура"] = Nom;
        Line["Содержание"] = Input.description;
        Line["Количество"] = Input.quantity;
        Line["Цена"] = Input.unitPrice;
        Line["Сумма"] = Input.net;
        Line["СтавкаНДС"] = Enums["СтавкиНДС"]["НДС" + Input.vatRate];
        Line["СуммаНДС"] = Input.vat;
        Line["СчетДоходов"] = AccountingCodes(Settings.incomeAccount)[0];
        Line["СчетУчетаНДСПоРеализации"] = ChartsOfAccounts["Хозрасчетный"].FindByCode("90.03");
    EndDo;
    // Explicit synthetic organizations are fixtures; real organizations use BP's
    // normal write handlers. No general fallback bypasses BP business validation.
    If Left(Org.Description, 13) = "ТЕСТ WH-DEMO-" Then Doc.DataExchange.Load = True; EndIf;
    Doc.SetNewNumber();
    Doc.Write();
    Link.DocumentId = String(Doc.Ref.UUID());
    Link.ReceivedAt = CurrentDate(); Link.Write();
EndProcedure

Function GetServiceActDocument(SourceId, Environment, ActId) Export
    SourceRecord(SourceId, Environment);
    Link = Record("WH_ActDocuments", SourceId, "ActId", ActId);
    If Not Link.Selected() Then Return "null"; EndIf;
    Doc = Documents["РеализацияТоваровУслуг"].GetRef(New UUID(Link.DocumentId)).GetObject();
    If Doc = Undefined Then Raise "ACT_DOCUMENT_NOT_FOUND"; EndIf;
    Return Encode(New Structure("actId,documentId,number,date,total,posted,ledgerId",
        ActId, Link.DocumentId, Doc.Number, Format(Doc.Date, "DF=yyyy-MM-dd"), Doc["СуммаДокумента"], Doc.Posted, Link.LedgerId));
EndFunction

Function PostDemoAct(SourceId, Environment, ActId, Confirmation) Export
    If Confirmation <> "POST_MARKED_DEMO_OPERATION" Then Raise "DEMO_CONFIRMATION_REQUIRED"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Link = Record("WH_ActDocuments", SourceId, "ActId", ActId);
        If Not Link.Selected() Then Raise "ACT_DOCUMENT_NOT_FOUND"; EndIf;
        If Link.LedgerId <> "" Then CommitTransaction(); Return Link.LedgerId; EndIf;
        Doc = Documents["РеализацияТоваровУслуг"].GetRef(New UUID(Link.DocumentId)).GetObject();
        Org = Doc["Организация"];
        If Left(Org.Description, 13) <> "ТЕСТ WH-DEMO-" Then Raise "DEMO_ORGANIZATION_REQUIRED"; EndIf;
        // Demonstration only: native manual-operation ledger movement. This is
        // intentionally distinct from posting a sales document and VAT registers.
        Link.LedgerId = DemoLedger(Org, Doc["Контрагент"], Doc["ДоговорКонтрагента"], "62.01", "90.01.1", Doc["СуммаДокумента"], Doc.Date, "ТЕСТ Акт " + Doc.Number + " Wirehouse " + ActId);
        Link.Write(); CommitTransaction(); Return Link.LedgerId;
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndFunction
