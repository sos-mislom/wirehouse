// Explicit, marked demo data only. No demo fixture is created by a scheduled run.
Function DemoCatalog(Name, Description)
    Item = Catalogs[Name].CreateItem();
    Item.Description = Description;
    Item.DataExchange.Load = True;
    Return Item;
EndFunction

Procedure CorrectDemoCharge(SourceId, Environment, DemoKey, Amount, Confirmation) Export
    If Confirmation <> "CORRECT_MARKED_DEMO_OPERATION" Then Raise "DEMO_CONFIRMATION_REQUIRED"; EndIf;
    CheckMoney(Amount);
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Fixture = Record("WH_Demos", SourceId, "DemoKey", DemoKey);
        If Not Fixture.Selected() Then Raise "DEMO_NOT_FOUND"; EndIf;
        Data = Decode(Fixture.Payload);
        Org = Catalogs["Организации"].GetRef(New UUID(Data.organizationId));
        If Left(Org.Description, 13) <> "ТЕСТ WH-DEMO-" Then Raise "DEMO_ORGANIZATION_REQUIRED"; EndIf;
        Doc = Documents["ОперацияБух"].GetRef(New UUID(Data.chargeDocumentId)).GetObject();
        If Doc["Организация"] <> Org Or StrFind(Doc["Содержание"], DemoKey) = 0 Then Raise "DEMO_DOCUMENT_MISMATCH"; EndIf;
        Records = AccountingRegisters["Хозрасчетный"].CreateRecordSet();
        Records.Filter.Recorder.Set(Doc.Ref); Records.Read();
        If Records.Count() <> 1 Then Raise "DEMO_DOCUMENT_MISMATCH"; EndIf;
        Records.Get(0)["Сумма"] = Amount;
        Doc["СуммаОперации"] = Amount; Doc.DataExchange.Load = True; Doc.Write(); Records.Write();
        CommitTransaction();
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndProcedure

Function DemoLedger(Org, Tenant, Contract, DebitCode, CreditCode, Amount, EntryDate, Description)
    // A native manual operation and native ledger records, not CRM-calculated sums.
    Doc = Documents["ОперацияБух"].CreateDocument();
    Doc.Date = EntryDate;
    Doc["Организация"] = Org;
    Doc["Содержание"] = Description;
    Doc["СуммаОперации"] = Amount;
    Doc.DataExchange.Load = True;
    Doc.SetNewNumber();
    Doc.Write();
    Set = AccountingRegisters["Хозрасчетный"].CreateRecordSet();
    Set.Filter.Recorder.Set(Doc.Ref);
    Entry = Set.Add();
    Entry.Period = EntryDate;
    Entry.Active = True;
    Entry["Организация"] = Org;
    Entry["СчетДт"] = ChartsOfAccounts["Хозрасчетный"].FindByCode(DebitCode);
    Entry["СчетКт"] = ChartsOfAccounts["Хозрасчетный"].FindByCode(CreditCode);
    Entry["Сумма"] = Amount;
    Entry["Содержание"] = Description;
    PartyDimension = PredefinedValue("ПланВидовХарактеристик.ВидыСубконтоХозрасчетные.Контрагенты");
    ContractDimension = PredefinedValue("ПланВидовХарактеристик.ВидыСубконтоХозрасчетные.Договоры");
    If DebitCode = "62.01" Then
        Entry["СубконтоДт"][PartyDimension] = Tenant;
        Entry["СубконтоДт"][ContractDimension] = Contract;
    EndIf;
    If CreditCode = "62.01" Then
        Entry["СубконтоКт"][PartyDimension] = Tenant;
        Entry["СубконтоКт"][ContractDimension] = Contract;
    EndIf;
    Set.Write();
    Return String(Doc.Ref.UUID());
EndFunction

Function CreateDemo(SourceId, Environment, DemoKey, Confirmation) Export
    If Confirmation <> "CREATE_MARKED_TEST_DATA" Or Left(DemoKey, 8) <> "WH-DEMO-" Then Raise "DEMO_CONFIRMATION_REQUIRED"; EndIf;
    CheckText(DemoKey);
    ConfigureSource(SourceId, Environment);
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Saved = Record("WH_Demos", SourceId, "DemoKey", DemoKey);
        If Saved.Selected() Then
            CommitTransaction(); Return Saved.Payload;
        EndIf;
        Org = DemoCatalog("Организации", "ТЕСТ " + DemoKey + " Арендодатель");
        Org["ИНН"] = "9900000013";
        Org["НаименованиеПолное"] = Org.Description;
        Org.Write();
        Tenant = DemoCatalog("Контрагенты", "ТЕСТ " + DemoKey + " Арендатор");
        Tenant["ИНН"] = "9900000020";
        Phone = Tenant["КонтактнаяИнформация"].Add();
        Phone["Тип"] = Enums["ТипыКонтактнойИнформации"]["Телефон"];
        Phone["Представление"] = "+12025550101";
        Phone["НомерТелефона"] = "+12025550101";
        Mail = Tenant["КонтактнаяИнформация"].Add();
        Mail["Тип"] = Enums["ТипыКонтактнойИнформации"]["АдресЭлектроннойПочты"];
        Mail["Представление"] = "wirehouse-demo@example.invalid";
        Mail["АдресЭП"] = "wirehouse-demo@example.invalid";
        Tenant.Write();
        Contract = DemoCatalog("ДоговорыКонтрагентов", "ТЕСТ " + DemoKey + " Аренда");
        Contract.Owner = Tenant.Ref;
        Contract["Организация"] = Org.Ref;
        Contract["Номер"] = DemoKey + "-LEASE";
        Contract["Дата"] = Date(2026, 1, 1);
        Contract["СрокДействия"] = Date(2027, 12, 31);
        Ruble = Catalogs["Валюты"].FindByCode("643");
        If Ruble.IsEmpty() Then
            Currency = DemoCatalog("Валюты", "Российский рубль");
            Currency.Code = "643"; Currency.Write();
            Ruble = Currency.Ref;
        EndIf;
        Contract["ВалютаВзаиморасчетов"] = Ruble;
        Contract["ВидДоговора"] = Enums["ВидыДоговоровКонтрагентов"]["СПокупателем"];
        Contract.Write();
        Nom = DemoCatalog("Номенклатура", "ТЕСТ " + DemoKey + " Услуга эксплуатации");
        Nom["Услуга"] = True;
        Nom.Write();
        OrgId = String(Org.Ref.UUID()); TenantId = String(Tenant.Ref.UUID()); ContractId = String(Contract.Ref.UUID());
        PropertyId = String(New UUID); UnitId = String(New UUID); MeterId = String(New UUID); AccountId = String(New UUID);
        PutCatalog(SourceId, Environment, "properties", Encode(New Structure("externalId,version,name,address,totalArea,rentableArea,warehouseClass",
            PropertyId, 1, "ТЕСТ " + DemoKey + " Склад", "Демонстрационный адрес, корпус 1", 1000, 900, "B")));
        PutCatalog(SourceId, Environment, "units", Encode(New Structure("externalId,version,propertyExternalId,number,floor,area,type,building,entrance",
            UnitId, 1, PropertyId, "DEMO-101", 1, 100, "warm", "1", "1")));
        PutCatalog(SourceId, Environment, "tenants", Encode(New Structure("externalId,version,name,inn,contactName,phone,email",
            TenantId, 1, Tenant.Description, Tenant["ИНН"], "ТЕСТ Контакт арендатора", "", "")));
        PutCatalog(SourceId, Environment, "leases", Encode(New Structure("externalId,version,tenantExternalId,unitExternalId,contractNumber,startDate,endDate,stage,ratePerSqm,deposit,indexationPct",
            ContractId, 1, TenantId, UnitId, Contract["Номер"], "2026-01-01", "2027-12-31", "active", 100, 1000, 0)));
        PutCatalog(SourceId, Environment, "meters", Encode(New Structure("externalId,version,propertyExternalId,unitExternalId,name,resource,scope,serialNumber,initialValue,tariff,active",
            MeterId, 1, PropertyId, UnitId, "ТЕСТ " + DemoKey + " Вода", "water", "individual", DemoKey + "-MTR", 100, 50, True)));
        PutAccount(SourceId, Environment, Encode(New Structure("externalId,leaseExternalId,number,validFrom,validTo,status,version",
            AccountId, ContractId, DemoKey + "-LS", "2026-01-01", "2027-12-31", "active", 1)));
        PutMeter(SourceId, Environment, Encode(New Structure("externalId,accountExternalId,initialValue,active", MeterId, AccountId, 100, True)));
        Settings = New Structure("organizationId,settlementAccount,incomeAccount,moneyAccount,nomenclatureId,period,createActs",
            OrgId, "62.01", "90.01.1", "51", String(Nom.Ref.UUID()), "2026-10", True);
        PutFinance(SourceId, Environment, AccountId, Encode(Settings));
        OpeningDoc = DemoLedger(Org.Ref, Tenant.Ref, Contract.Ref, "62.01", "90.01.1", 1000, Date(2026, 9, 30, 12, 0, 0), "ТЕСТ " + DemoKey + " Входящий долг");
        ChargeDoc = DemoLedger(Org.Ref, Tenant.Ref, Contract.Ref, "62.01", "90.01.1", 10000, Date(2026, 10, 10, 12, 0, 0), "ТЕСТ " + DemoKey + " Аренда за октябрь");
        PaymentDoc = DemoLedger(Org.Ref, Tenant.Ref, Contract.Ref, "51", "62.01", 6000, Date(2026, 10, 20, 12, 0, 0), "ТЕСТ " + DemoKey + " Оплата аренды");
        Result = New Structure("demoKey,organizationId,tenantId,contractId,propertyId,unitId,meterId,accountId,nomenclatureId,openingDocumentId,chargeDocumentId,paymentDocumentId,expectedOpening,expectedCharged,expectedPaid,expectedClosing",
            DemoKey, OrgId, TenantId, ContractId, PropertyId, UnitId, MeterId, AccountId, String(Nom.Ref.UUID()), OpeningDoc, ChargeDoc, PaymentDoc, 1000, 10000, 6000, 5000);
        Saved.Payload = Encode(Result); Saved.CreatedAt = CurrentDate(); Saved.Write();
        CommitTransaction(); Return Encode(Result);
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndFunction

Function GetFinancialSnapshot(SourceId, Environment, AccountExternalId) Export
    SourceRecord(SourceId, Environment);
    Row = Record("WH_Finance", SourceId, "AccountExternalId", AccountExternalId);
    If Not Row.Selected() Then Raise "FINANCE_NOT_CONFIGURED"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Result = StatementData(SourceId, AccountExternalId, Decode(Row.Payload));
        CommitTransaction(); Return Encode(Result);
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndFunction
