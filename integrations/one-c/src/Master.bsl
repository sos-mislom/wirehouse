// Source-owned operational attributes absent from typical BP are kept in the
// extension. Native counterparties/contracts and accounting movements remain BP-owned.
Function CatalogRecord(SourceId, Kind, ExternalId)
    Row = InformationRegisters.WH_Catalog.CreateRecordManager();
    Row.SourceId = SourceId;
    Row.Kind = Kind;
    Row.ExternalId = ExternalId;
    Row.Read();
    Row.SourceId = SourceId; Row.Kind = Kind; Row.ExternalId = ExternalId;
    Return Row;
EndFunction

Function BindingRecord(SourceId, ExternalId, ValidFrom)
    Row = InformationRegisters.WH_MeterBindings.CreateRecordManager();
    Row.SourceId = SourceId; Row.ExternalId = ExternalId; Row.ValidFrom = ValidFrom; Row.Read();
    Row.SourceId = SourceId; Row.ExternalId = ExternalId; Row.ValidFrom = ValidFrom;
    Return Row;
EndFunction

Function MeterAccountForPeriod(SourceId, ExternalId, Period)
    Query = New Query("SELECT TOP 1 AccountExternalId FROM InformationRegister.WH_MeterBindings WHERE SourceId = &SourceId AND ExternalId = &Meter AND ValidFrom <= &EndDate ORDER BY ValidFrom DESC");
    Query.SetParameter("SourceId", SourceId); Query.SetParameter("Meter", ExternalId);
    Query.SetParameter("EndDate", Format(EndOfMonth(ISODate(Period + "-01")), "DF=yyyy-MM-dd"));
    Rows = Query.Execute().Select();
    If Rows.Next() Then Return Rows.AccountExternalId; EndIf;
    Return Record("WH_Meters", SourceId, "ExternalId", ExternalId).AccountExternalId;
EndFunction

Procedure SetMeterAccount(SourceId, Environment, ExternalId, AccountExternalId, ValidFrom) Export
    Effective = ISODate(ValidFrom);
    If Day(Effective) <> 1 Then Raise "METER_BINDING_MONTH_REQUIRED"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Meter = Record("WH_Meters", SourceId, "ExternalId", ExternalId);
        Account = Record("WH_Accounts", SourceId, "ExternalId", AccountExternalId);
        If Not Meter.Selected() Then Raise "METER_NOT_FOUND"; EndIf;
        If Not Account.Selected() Then Raise "ACCOUNT_NOT_FOUND"; EndIf;
        If Account.Status <> "active" Or ISODate(Account.ValidFrom) > EndOfMonth(Effective) Then Raise "ACCOUNT_NOT_ACTIVE"; EndIf;
        If Account.ValidTo <> "" And ISODate(Account.ValidTo) < Effective Then Raise "ACCOUNT_NOT_ACTIVE"; EndIf;
        VerifyBPContract(Account.LeaseExternalId, True);
        Target = BindingRecord(SourceId, ExternalId, ValidFrom);
        If Target.Selected() Then
            If Target.AccountExternalId <> AccountExternalId Then Raise "METER_BINDING_CONFLICT"; EndIf;
            CommitTransaction(); Return;
        EndIf;
        Query = New Query("SELECT TOP 1 BillingPeriod FROM InformationRegister.WH_Readings WHERE SourceId = &SourceId AND MeterExternalId = &Meter ORDER BY BillingPeriod DESC");
        Query.SetParameter("SourceId", SourceId); Query.SetParameter("Meter", ExternalId);
        Rows = Query.Execute().Select();
        If Rows.Next() And ValidFrom <= Rows.BillingPeriod + "-31" Then Raise "METER_BINDING_HAS_READINGS"; EndIf;
        Query.Text = "SELECT TOP 1 ValidFrom FROM InformationRegister.WH_MeterBindings WHERE SourceId = &SourceId AND ExternalId = &Meter ORDER BY ValidFrom DESC";
        Rows = Query.Execute().Select();
        If Rows.Next() Then
            If ValidFrom <= Rows.ValidFrom Then Raise "METER_BINDING_OUT_OF_ORDER"; EndIf;
        Else
            PreviousAccount = Record("WH_Accounts", SourceId, "ExternalId", Meter.AccountExternalId);
            If ValidFrom <= PreviousAccount.ValidFrom Then Raise "METER_BINDING_OUT_OF_ORDER"; EndIf;
            Initial = BindingRecord(SourceId, ExternalId, PreviousAccount.ValidFrom);
            Initial.AccountExternalId = Meter.AccountExternalId; Initial.CreatedAt = CurrentDate(); Initial.Write();
        EndIf;
        Target.AccountExternalId = AccountExternalId; Target.CreatedAt = CurrentDate(); Target.Write();
        Meter.AccountExternalId = AccountExternalId; Meter.Write();
        CommitTransaction();
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndProcedure

Procedure PutCatalog(SourceId, Environment, Kind, JSON) Export
    If Kind <> "properties" And Kind <> "units" And Kind <> "tenants" And Kind <> "leases" And Kind <> "meters" Then Raise "UNSUPPORTED_KIND"; EndIf;
    Data = Decode(JSON);
    CheckText(Data.externalId);
    CheckVersion(Data.version);
    If Kind = "leases" Then VerifyBPContract(Data.externalId); EndIf;
    If Kind = "tenants" Then
        Item = Catalogs["Контрагенты"].GetRef(New UUID(Data.externalId)).GetObject();
        If Item = Undefined Or Item.DeletionMark Then Raise "BP_COUNTERPARTY_NOT_FOUND"; EndIf;
    EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Row = CatalogRecord(SourceId, Kind, Data.externalId);
        Hash = Digest(Data);
        If Row.Selected() Then
            If Data.version < Row.Version Then Raise "STALE_VERSION"; EndIf;
            If Data.version = Row.Version And Row.PayloadHash <> Hash Then Raise "VERSION_CONFLICT"; EndIf;
        EndIf;
        Row.Environment = Environment;
        Row.Payload = Encode(Data);
        Row.PayloadHash = Hash;
        Row.Version = Data.version;
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndProcedure

Function NativeContract(ExternalId)
    VerifyBPContract(ExternalId);
    Return Catalogs["ДоговорыКонтрагентов"].GetRef(New UUID(ExternalId)).GetObject();
EndFunction

Function Snapshot(SourceId, Kind, Data)
    // Versions describe source content, not a local CRM edit or transport retry.
    Business = Decode(Encode(Data));
    Business.Delete("version");
    Business.Delete("asOf");
    If Kind = "statements" Then Business.Insert("verifiedOn", Format(CurrentUniversalDate(), "DF=yyyy-MM-dd")); EndIf;
    Hash = Digest(Business);
    Row = InformationRegisters.WH_Snapshots.CreateRecordManager();
    Row.SourceId = SourceId; Row.Kind = Kind; Row.ExternalId = Data.externalId; Row.Read();
    Row.SourceId = SourceId; Row.Kind = Kind; Row.ExternalId = Data.externalId;
    If Row.Selected() And Row.PayloadHash = Hash Then Return Decode(Row.Payload); EndIf;
    Row.Version = Row.Version + 1;
    Data.Insert("version", Row.Version);
    If Kind = "statements" Then Data.Insert("asOf", Format(CurrentUniversalDate(), "DF=yyyy-MM-dd'T'HH:mm:ss'Z'")); EndIf;
    Row.Payload = Encode(Data); Row.PayloadHash = Hash; Row.Write();
    Return Data;
EndFunction

Function CatalogItems(SourceId, Kind)
    Query = New Query("SELECT Payload FROM InformationRegister.WH_Catalog WHERE SourceId = &SourceId AND Kind = &Kind ORDER BY ExternalId");
    Query.SetParameter("SourceId", SourceId); Query.SetParameter("Kind", Kind);
    Rows = Query.Execute().Select();
    Items = New Array;
    While Rows.Next() Do
        Data = Decode(Rows.Payload);
        If Kind = "tenants" Then
            Item = Catalogs["Контрагенты"].GetRef(New UUID(Data.externalId)).GetObject();
            If Item = Undefined Or Item.DeletionMark Then Raise "BP_COUNTERPARTY_NOT_FOUND"; EndIf;
            Data.name = TrimAll(Item.Description);
            Data.inn = TrimAll(Item["ИНН"]);
            // Contacts are read from the actual BP contact table. A missing
            // phone/email stays empty and never enrolls a CRM user.
            Data.phone = ""; Data.email = "";
            For Each Contact In Item["КонтактнаяИнформация"] Do
                If Contact["Тип"] = Enums["ТипыКонтактнойИнформации"]["Телефон"] Then
                    Data.phone = StrReplace(StrReplace(StrReplace(TrimAll(Contact["НомерТелефона"]), " ", ""), "-", ""), "(", "");
                    Data.phone = StrReplace(Data.phone, ")", "");
                ElsIf Contact["Тип"] = Enums["ТипыКонтактнойИнформации"]["АдресЭлектроннойПочты"] Then
                    Data.email = TrimAll(Contact["АдресЭП"]);
                EndIf;
            EndDo;
        ElsIf Kind = "leases" Then
            Contract = NativeContract(Data.externalId);
            Data.tenantExternalId = String(Contract.Owner.UUID());
            Data.contractNumber = TrimAll(Contract["Номер"]);
            Data.startDate = Format(Contract["Дата"], "DF=yyyy-MM-dd");
            If Contract["ДоговорЗакрыт"] Then Data.stage = "terminated"; EndIf;
        EndIf;
        Items.Add(Snapshot(SourceId, Kind, Data));
    EndDo;
    Return Items;
EndFunction

Function AccountingCodes(Text)
    CheckText(Text, 300);
    Result = New Array;
    For Each Code In StrSplit(Text, ",") Do
        Account = ChartsOfAccounts["Хозрасчетный"].FindByCode(TrimAll(Code));
        If Account.IsEmpty() Then Raise "ACCOUNTING_ACCOUNT_NOT_FOUND"; EndIf;
        If Result.Find(Account) = Undefined Then Result.Add(Account); EndIf;
    EndDo;
    If Result.Count() = 0 Or Result.Count() > 20 Then Raise "ACCOUNTING_ACCOUNT_NOT_FOUND"; EndIf;
    Return Result;
EndFunction

Procedure PutFinance(SourceId, Environment, AccountExternalId, JSON) Export
    Data = Decode(JSON);
    CheckKeys(Data, "organizationId,settlementAccount,incomeAccount,moneyAccount,nomenclatureId,period,createActs");
    ISODate(Data.period + "-01");
    Org = Catalogs["Организации"].GetRef(New UUID(Data.organizationId)).GetObject();
    If Org = Undefined Or Org.DeletionMark Then Raise "BP_ORGANIZATION_NOT_FOUND"; EndIf;
    For Each Code In StrSplit("settlementAccount,incomeAccount,moneyAccount", ",") Do
        AccountingCodes(Data[Code]);
    EndDo;
    Settlement = ChartsOfAccounts["Хозрасчетный"].FindByCode(Data.settlementAccount);
    If Settlement["ВидыСубконто"].Count() < 2 Then Raise "UNSUPPORTED_ACCOUNTING_ANALYTICS"; EndIf;
    If Settlement["ВидыСубконто"].Get(1)["ВидСубконто"] <> PredefinedValue("ПланВидовХарактеристик.ВидыСубконтоХозрасчетные.Договоры") Then Raise "UNSUPPORTED_ACCOUNTING_ANALYTICS"; EndIf;
    If TypeOf(Data.createActs) <> Type("Boolean") Then Raise "INVALID_ACTIVE_FLAG"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Account = Record("WH_Accounts", SourceId, "ExternalId", AccountExternalId);
        If Not Account.Selected() Then Raise "ACCOUNT_NOT_FOUND"; EndIf;
        If NativeContract(Account.LeaseExternalId)["Организация"] <> Org.Ref Then Raise "ACCOUNT_ORGANIZATION_MISMATCH"; EndIf;
        Row = Record("WH_Finance", SourceId, "AccountExternalId", AccountExternalId);
        Row.Payload = Encode(Data); Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndProcedure

Function StatementData(SourceId, AccountExternalId, Settings)
    Account = Record("WH_Accounts", SourceId, "ExternalId", AccountExternalId);
    Contract = NativeContract(Account.LeaseExternalId);
    Org = Catalogs["Организации"].GetRef(New UUID(Settings.organizationId));
    Settlement = ChartsOfAccounts["Хозрасчетный"].FindByCode(Settings.settlementAccount);
    Income = AccountingCodes(Settings.incomeAccount);
    Money = AccountingCodes(Settings.moneyAccount);
    StartDate = ISODate(Settings.period + "-01");
    EndDate = EndOfMonth(StartDate);
    Query = New Query("SELECT Период, Регистратор, НомерСтроки, Содержание, СчетДт, СчетКт, СубконтоДт2, СубконтоКт2, Сумма FROM AccountingRegister.Хозрасчетный.RecordsWithExtDimensions(, &EndDate, Активность AND Организация = &Org AND (СчетДт = &Settlement OR СчетКт = &Settlement)) WHERE (СчетДт = &Settlement AND СубконтоДт2 = &Contract) OR (СчетКт = &Settlement AND СубконтоКт2 = &Contract) ORDER BY Период, Регистратор, НомерСтроки");
    Query.SetParameter("Org", Org); Query.SetParameter("EndDate", EndDate);
    Query.SetParameter("Settlement", Settlement); Query.SetParameter("Contract", Contract.Ref);
    Rows = Query.Execute().Select();
    Opening = 0; Charged = 0; Paid = 0; Closing = 0;
    Lines = New Array;
    While Rows.Next() Do
        Debit = Rows["СчетДт"] = Settlement And Rows["СубконтоДт2"] = Contract.Ref;
        Credit = Rows["СчетКт"] = Settlement And Rows["СубконтоКт2"] = Contract.Ref;
        Delta = ?(Debit, Rows["Сумма"], 0) - ?(Credit, Rows["Сумма"], 0);
        Closing = Closing + Delta;
        If Rows["Период"] < StartDate Then Opening = Opening + Delta; Continue; EndIf;
        ChargeChange = 0;
        If Debit And Income.Find(Rows["СчетКт"]) <> Undefined Then ChargeChange = Rows["Сумма"];
        ElsIf Credit And Income.Find(Rows["СчетДт"]) <> Undefined Then ChargeChange = -Rows["Сумма"];
        ElsIf Credit And Money.Find(Rows["СчетДт"]) <> Undefined Then Paid = Paid + Rows["Сумма"];
        ElsIf Debit And Money.Find(Rows["СчетКт"]) <> Undefined Then Paid = Paid - Rows["Сумма"];
        Else Raise "UNMAPPED_ACCOUNTING_MOVEMENT";
        EndIf;
        Charged = Charged + ChargeChange;
        If ChargeChange <> 0 Then
            Service = TrimAll(Rows["Содержание"]);
            If Service = "" Then Service = String(Rows["Регистратор"]); EndIf;
            Lines.Add(New Structure("service,amount", Left(Service, 300), ChargeChange));
        EndIf;
    EndDo;
    If Opening + Charged - Paid <> Closing Then Raise "ACCOUNTING_BALANCE_MISMATCH"; EndIf;
    If Lines.Count() > 500 Then Raise "STATEMENT_LINE_LIMIT"; EndIf;
    Data = New Structure("externalId,accountExternalId,period,opening,charged,paid,closing,lines,version",
        AccountExternalId + ":" + Settings.period, AccountExternalId, Settings.period, Opening, Charged, Paid, Closing, Lines, 1);
    Return Snapshot(SourceId, "statements", Data);
EndFunction

Function BuildItems(SourceId, Kind)
    If Kind = "accounts" Then
        Items = New Array;
        Rows = QueryRows("SELECT * FROM InformationRegister.WH_Accounts WHERE SourceId = &SourceId ORDER BY ExternalId", SourceId);
        While Rows.Next() Do
            Data = AccountData(Rows);
            If NativeContract(Data.leaseExternalId)["ДоговорЗакрыт"] Then Data.status = "closed"; EndIf;
            Items.Add(Snapshot(SourceId, Kind, Data));
        EndDo;
        Return Items;
    ElsIf Kind = "statements" Then
        Items = New Array;
        Rows = QueryRows("SELECT AccountExternalId, Payload FROM InformationRegister.WH_Finance WHERE SourceId = &SourceId ORDER BY AccountExternalId", SourceId);
        While Rows.Next() Do
            Settings = Decode(Rows.Payload);
            PeriodDate = ISODate(Settings.period + "-01");
            If PeriodDate > BegOfMonth(CurrentDate()) Then Raise "STATEMENT_PERIOD_IN_FUTURE"; EndIf;
            Count = 0;
            While PeriodDate <= BegOfMonth(CurrentDate()) Do
                Settings.period = Format(PeriodDate, "DF=yyyy-MM");
                Items.Add(StatementData(SourceId, Rows.AccountExternalId, Settings));
                PeriodDate = AddMonth(PeriodDate, 1); Count = Count + 1;
                If Count > 120 Then Raise "STATEMENT_HISTORY_LIMIT"; EndIf;
            EndDo;
        EndDo;
        Return Items;
    EndIf;
    Return CatalogItems(SourceId, Kind);
EndFunction

Function QueueAll(SourceId, Environment) Export
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Result = New Array;
        Priority = 0;
        For Each Kind In StrSplit("properties,units,tenants,leases,meters,accounts,statements", ",") Do
            Priority = Priority + 1;
            Items = BuildItems(SourceId, Kind);
            If Items.Count() = 0 Then Continue; EndIf;
            Hash = Digest(Items);
            Stream = InformationRegisters.WH_Streams.CreateRecordManager();
            Stream.SourceId = SourceId; Stream.Kind = Kind; Stream.Read();
            Stream.SourceId = SourceId; Stream.Kind = Kind;
            If Stream.Selected() And Stream.PayloadHash = Hash Then Continue; EndIf;
            Query = New Query("SELECT TOP 1 MessageId FROM InformationRegister.WH_Outbox WHERE SourceId = &SourceId AND Kind = &Kind AND Status <> ""applied""");
            Query.SetParameter("SourceId", SourceId); Query.SetParameter("Kind", Kind);
            If Query.Execute().Select().Next() Then Continue; EndIf;
            Index = 0;
            While Index < Items.Count() Do
                Batch = New Array;
                While Index < Items.Count() And Batch.Count() < 500 Do Batch.Add(Items[Index]); Index = Index + 1; EndDo;
                MessageId = String(New UUID);
                Packet = New Structure("messageId,environment,schemaVersion,kind,items", MessageId, Environment, 1, Kind, Batch);
                Row = Record("WH_Outbox", SourceId, "MessageId", MessageId);
                Row.Environment = Environment; Row.Kind = Kind; Row.Payload = Encode(Packet);
                Row.Priority = Priority * 1000000 + Index;
                Row.Status = "pending"; Row.Attempts = 0; Row.UpdatedAt = CurrentDate(); Row.Write();
                Result.Add(MessageId);
            EndDo;
            Stream.PayloadHash = Hash; Stream.MessageId = MessageId; Stream.Write();
        EndDo;
        CommitTransaction(); Return Encode(Result);
    Except
        RollbackTransaction(); Raise;
    EndTry;
EndFunction
