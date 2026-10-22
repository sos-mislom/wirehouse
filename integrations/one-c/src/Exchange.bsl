// Wirehouse exchange boundary. No privileged mode and no changes to BP objects.
Function AdapterInfo() Export
    Return "{""adapterVersion"":""0.2.0"",""schemaVersion"":1,""incomingKinds"":[""readings"",""work_results"",""work_reopened"",""service_acts""]}";
EndFunction

Function Decode(Text)
    Reader = New JSONReader;
    Reader.SetString(Text);
    Result = ReadJSON(Reader);
    Reader.Close();
    Return Result;
EndFunction

Function Encode(Value)
    Writer = New JSONWriter;
    Writer.SetString();
    WriteJSON(Writer, Value);
    Return Writer.Close();
EndFunction

Function Canonical(Value)
    If TypeOf(Value) = Type("Structure") Then
        Keys = New ValueTable;
        Keys.Columns.Add("FieldName");
        For Each Pair In Value Do
            Keys.Add().FieldName = Pair.Key;
        EndDo;
        Keys.Sort("FieldName Asc");
        Result = New Structure;
        For Each Row In Keys Do
            Result.Insert(Row.FieldName, Canonical(Value[Row.FieldName]));
        EndDo;
        Return Result;
    ElsIf TypeOf(Value) = Type("Array") Then
        Result = New Array;
        For Each Item In Value Do
            Result.Add(Canonical(Item));
        EndDo;
        Return Result;
    EndIf;
    Return Value;
EndFunction

Function Digest(Value)
    Hasher = New DataHashing(HashFunction.SHA256);
    Hasher.Append(Encode(Canonical(Value)));
    Return Base64String(Hasher.HashSum);
EndFunction

Procedure CheckKeys(Value, Names)
    If TypeOf(Value) <> Type("Structure") Then Raise "INVALID_OBJECT"; EndIf;
    Keys = StrSplit(Names, ",");
    If Value.Count() <> Keys.Count() Then Raise "INVALID_FIELDS"; EndIf;
    For Each FieldName In Keys Do
        If Not Value.Property(FieldName) Then Raise "INVALID_FIELDS"; EndIf;
    EndDo;
EndProcedure

Procedure CheckText(Value, MaxLength = 100)
    If TypeOf(Value) <> Type("String") Then Raise "INVALID_TEXT"; EndIf;
    If StrLen(Value) = 0 Or StrLen(Value) > MaxLength Or TrimAll(Value) <> Value Then
        Raise "INVALID_TEXT";
    EndIf;
EndProcedure

Procedure CheckNumber(Value)
    If TypeOf(Value) <> Type("Number") Then Raise "INVALID_NUMBER"; EndIf;
    If Value < 0 Or Value > 1000000000000 Or Round(Value, 10) <> Value Then Raise "INVALID_NUMBER"; EndIf;
EndProcedure

Function ISODate(Value)
    CheckText(Value, 10);
    If StrLen(Value) <> 10 Or Mid(Value, 5, 1) <> "-" Or Mid(Value, 8, 1) <> "-" Then Raise "INVALID_DATE"; EndIf;
    Result = Date(StrReplace(Value, "-", ""));
    If Format(Result, "DF=yyyy-MM-dd") <> Value Then Raise "INVALID_DATE"; EndIf;
    Return Result;
EndFunction

Function Record(Name, SourceId, KeyName = "", KeyValue = "")
    Result = InformationRegisters[Name].CreateRecordManager();
    Result.SourceId = SourceId;
    If KeyName <> "" Then Result[KeyName] = KeyValue; EndIf;
    Result.Read();
    Return Result;
EndFunction

Function SourceRecord(SourceId, Environment, Lock = False)
    CheckText(SourceId);
    If Environment <> "test" And Environment <> "production" Then Raise "INVALID_ENVIRONMENT"; EndIf;
    Result = Record("WH_Sources", SourceId);
    If Not Result.Selected() Then Raise "SOURCE_NOT_CONFIGURED"; EndIf;
    If Result.Environment <> Environment Then Raise "ENVIRONMENT_MISMATCH"; EndIf;
    // The source write acquires a native transactional lock before reading
    // receipts. Every mutation uses this same source lock, including settings.
    If Lock Then Result.Write(); EndIf;
    Return Result;
EndFunction

Procedure ConfigureSource(SourceId, Environment) Export
    CheckText(SourceId);
    If Environment <> "test" And Environment <> "production" Then Raise "INVALID_ENVIRONMENT"; EndIf;
    BeginTransaction();
    Try
        Row = Record("WH_Sources", SourceId);
        If Row.Selected() And Row.Environment <> Environment Then Raise "ENVIRONMENT_IMMUTABLE"; EndIf;
        Row.SourceId = SourceId;
        Row.Environment = Environment;
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndProcedure

Function AccountData(Row)
    Result = New Structure;
    Result.Insert("externalId", Row.ExternalId);
    Result.Insert("leaseExternalId", Row.LeaseExternalId);
    Result.Insert("number", Row.Number);
    Result.Insert("validFrom", Row.ValidFrom);
    If Row.ValidTo = "" Then Result.Insert("validTo", Undefined); Else Result.Insert("validTo", Row.ValidTo); EndIf;
    Result.Insert("status", Row.Status);
    Result.Insert("version", Row.Version);
    Return Result;
EndFunction

Procedure VerifyBPContract(ExternalId, RequireActive = False)
    // Dynamic lookup keeps the extension independent of vendor object UUIDs.
    // On BP, the explicit mapping must reference a real, nondeleted contract.
    If Metadata.Catalogs.Find("ДоговорыКонтрагентов") <> Undefined Then
        Reference = Catalogs["ДоговорыКонтрагентов"].GetRef(New UUID(ExternalId));
        Item = Reference.GetObject();
        If Item = Undefined Then Raise "BP_CONTRACT_NOT_FOUND"; EndIf;
        If Item.DeletionMark Then Raise "BP_CONTRACT_DELETED"; EndIf;
        If RequireActive And Item["ДоговорЗакрыт"] Then Raise "BP_CONTRACT_CLOSED"; EndIf;
    EndIf;
EndProcedure

Procedure PutAccount(SourceId, Environment, JSON) Export
    Data = Decode(JSON);
    CheckKeys(Data, "externalId,leaseExternalId,number,validFrom,validTo,status,version");
    CheckText(Data.externalId);
    CheckText(Data.leaseExternalId);
    CheckText(Data.number, 300);
    StartDate = ISODate(Data.validFrom);
    If Data.validTo <> Undefined And ISODate(Data.validTo) < StartDate Then Raise "INVALID_DATE_RANGE"; EndIf;
    If Data.status <> "active" And Data.status <> "closed" Then Raise "INVALID_ACCOUNT_STATUS"; EndIf;
    If TypeOf(Data.version) <> Type("Number") Then Raise "INVALID_VERSION"; EndIf;
    If Data.version < 1 Or Data.version > 9999999999 Or Int(Data.version) <> Data.version Then Raise "INVALID_VERSION"; EndIf;
    VerifyBPContract(Data.leaseExternalId, Data.status = "active");
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Row = Record("WH_Accounts", SourceId, "ExternalId", Data.externalId);
        If Row.Selected() Then
            If Row.LeaseExternalId <> Data.leaseExternalId Then Raise "ACCOUNT_CONTRACT_IMMUTABLE"; EndIf;
            If Data.version < Row.Version Then Raise "STALE_VERSION"; EndIf;
            If Data.version = Row.Version And Digest(AccountData(Row)) <> Digest(Data) Then Raise "VERSION_CONFLICT"; EndIf;
        EndIf;
        Row.SourceId = SourceId;
        Row.ExternalId = Data.externalId;
        Row.Environment = Environment;
        Row.LeaseExternalId = Data.leaseExternalId;
        Row.Number = Data.number;
        Row.ValidFrom = Data.validFrom;
        Row.ValidTo = ?(Data.validTo = Undefined, "", Data.validTo);
        Row.Status = Data.status;
        Row.Version = Data.version;
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndProcedure

Procedure PutMeter(SourceId, Environment, JSON) Export
    Data = Decode(JSON);
    CheckKeys(Data, "externalId,accountExternalId,initialValue,active");
    CheckText(Data.externalId);
    CheckText(Data.accountExternalId);
    CheckNumber(Data.initialValue);
    If TypeOf(Data.active) <> Type("Boolean") Then Raise "INVALID_ACTIVE_FLAG"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Account = Record("WH_Accounts", SourceId, "ExternalId", Data.accountExternalId);
        If Not Account.Selected() Then Raise "ACCOUNT_NOT_FOUND"; EndIf;
        Row = Record("WH_Meters", SourceId, "ExternalId", Data.externalId);
        If Row.Selected() Then
            If Row.AccountExternalId <> Data.accountExternalId Or Row.InitialValue <> Data.initialValue Then
                Raise "METER_IDENTITY_IMMUTABLE";
            EndIf;
        EndIf;
        Row.SourceId = SourceId;
        Row.ExternalId = Data.externalId;
        Row.Environment = Environment;
        Row.AccountExternalId = Data.accountExternalId;
        Row.InitialValue = Data.initialValue;
        Row.IsActive = Data.active;
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndProcedure

Function QueryRows(Text, SourceId)
    Query = New Query(Text);
    Query.SetParameter("SourceId", SourceId);
    Return Query.Execute().Select();
EndFunction

Function QueueAccounts(SourceId, Environment) Export
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Pending = QueryRows("SELECT TOP 1 MessageId FROM InformationRegister.WH_Outbox WHERE SourceId = &SourceId AND Status <> ""applied"" ORDER BY UpdatedAt", SourceId);
        If Pending.Next() Then
            Result = Pending.MessageId;
            CommitTransaction();
            Return Result;
        EndIf;
        Rows = QueryRows("SELECT TOP 501 * FROM InformationRegister.WH_Accounts WHERE SourceId = &SourceId ORDER BY ExternalId", SourceId);
        Items = New Array;
        While Rows.Next() Do
            VerifyBPContract(Rows.LeaseExternalId, Rows.Status = "active");
            Items.Add(AccountData(Rows));
        EndDo;
        If Items.Count() = 0 Or Items.Count() > 500 Then Raise "ACCOUNT_BATCH_SIZE"; EndIf;
        MessageId = String(New UUID);
        Packet = New Structure("messageId,environment,schemaVersion,kind,items", MessageId, Environment, 1, "accounts", Items);
        Row = InformationRegisters.WH_Outbox.CreateRecordManager();
        Row.SourceId = SourceId;
        Row.MessageId = MessageId;
        Row.Environment = Environment;
        Row.Kind = "accounts";
        Row.Payload = Encode(Packet);
        Row.Status = "pending";
        Row.Attempts = 0;
        Row.UpdatedAt = CurrentDate();
        Row.Write();
        CommitTransaction();
        Return MessageId;
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndFunction

Function ClaimOutgoing(SourceId, Environment) Export
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Query = New Query("SELECT TOP 1 MessageId FROM InformationRegister.WH_Outbox WHERE SourceId = &SourceId AND Status <> ""applied"" AND Attempts < 8 AND NextAttemptAt <= &Now ORDER BY UpdatedAt");
        Query.SetParameter("SourceId", SourceId);
        Query.SetParameter("Now", CurrentDate());
        Rows = Query.Execute().Select();
        If Not Rows.Next() Then
            CommitTransaction();
            Return "null";
        EndIf;
        Row = Record("WH_Outbox", SourceId, "MessageId", Rows.MessageId);
        Row.Attempts = Row.Attempts + 1;
        Row.NextAttemptAt = CurrentDate() + 60;
        Row.UpdatedAt = CurrentDate();
        Row.Write();
        Result = New Structure("messageId,packet", Row.MessageId, Decode(Row.Payload));
        CommitTransaction();
        Return Encode(Result);
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndFunction

Procedure ConfirmOutgoing(SourceId, Environment, MessageId, Accepted) Export
    CheckText(MessageId);
    If TypeOf(Accepted) <> Type("Boolean") Then Raise "INVALID_ACK"; EndIf;
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Row = Record("WH_Outbox", SourceId, "MessageId", MessageId);
        If Not Row.Selected() Then Raise "OUTGOING_NOT_FOUND"; EndIf;
        If Row.Status = "applied" And Not Accepted Then Raise "ALREADY_CONFIRMED"; EndIf;
        Row.Status = ?(Accepted, "applied", "failed");
        Row.LastError = ?(Accepted, "", "CRM_NOT_APPLIED");
        Row.UpdatedAt = CurrentDate();
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndProcedure

Procedure RetryOutgoing(SourceId, Environment, MessageId) Export
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Row = Record("WH_Outbox", SourceId, "MessageId", MessageId);
        If Not Row.Selected() Or Row.Status = "applied" Then Raise "OUTGOING_NOT_RETRYABLE"; EndIf;
        Row.Attempts = 0;
        Row.NextAttemptAt = Date(1, 1, 1);
        Row.Status = "pending";
        Row.UpdatedAt = CurrentDate();
        Row.Write();
        CommitTransaction();
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndProcedure

Function StoreReading(SourceId, Environment, Data)
    CheckKeys(Data, "schemaVersion,submissionId,period,meterExternalId,accountExternalId,value,previous,photoDocumentId");
    If TypeOf(Data.schemaVersion) <> Type("Number") Or Data.schemaVersion <> 1 Then Raise "UNSUPPORTED_SCHEMA"; EndIf;
    CheckText(Data.submissionId);
    CheckText(Data.meterExternalId);
    CheckText(Data.accountExternalId);
    CheckText(Data.period, 7);
    BillingDate = ISODate(Data.period + "-01");
    CheckNumber(Data.value);
    CheckNumber(Data.previous);
    If Data.photoDocumentId <> Undefined Then CheckText(Data.photoDocumentId); EndIf;
    If Data.value < Data.previous Then Raise "DECREASING_READING"; EndIf;
    Existing = Record("WH_Readings", SourceId, "SubmissionId", Data.submissionId);
    If Existing.Selected() Then
        If Existing.MeterExternalId <> Data.meterExternalId Or Existing.AccountExternalId <> Data.accountExternalId
            Or Existing.BillingPeriod <> Data.period Or Existing.Value <> Data.value Or Existing.Previous <> Data.previous Then
            Raise "SUBMISSION_CONFLICT";
        EndIf;
        Return True;
    EndIf;
    Meter = Record("WH_Meters", SourceId, "ExternalId", Data.meterExternalId);
    If Not Meter.Selected() Then Raise "METER_NOT_FOUND"; EndIf;
    If Not Meter.IsActive Or Meter.AccountExternalId <> Data.accountExternalId Then Raise "METER_ACCOUNT_MISMATCH"; EndIf;
    Account = Record("WH_Accounts", SourceId, "ExternalId", Data.accountExternalId);
    If Not Account.Selected() Then Raise "ACCOUNT_NOT_FOUND"; EndIf;
    If Account.Status <> "active" Or ISODate(Account.ValidFrom) > EndOfMonth(BillingDate) Then Raise "ACCOUNT_NOT_ACTIVE"; EndIf;
    If Account.ValidTo <> "" And ISODate(Account.ValidTo) < BillingDate Then Raise "ACCOUNT_NOT_ACTIVE"; EndIf;
    VerifyBPContract(Account.LeaseExternalId, True);
    Query = New Query("SELECT TOP 1 BillingPeriod, Value FROM InformationRegister.WH_Readings WHERE SourceId = &SourceId AND MeterExternalId = &Meter ORDER BY BillingPeriod DESC");
    Query.SetParameter("SourceId", SourceId);
    Query.SetParameter("Meter", Data.meterExternalId);
    Previous = Query.Execute().Select();
    Expected = Meter.InitialValue;
    If Previous.Next() Then
        If Previous.BillingPeriod >= Data.period Then Raise "PERIOD_ALREADY_RECEIVED"; EndIf;
        Expected = Previous.Value;
    EndIf;
    If Expected <> Data.previous Then Raise "PREVIOUS_READING_CONFLICT"; EndIf;
    Row = InformationRegisters.WH_Readings.CreateRecordManager();
    Row.SourceId = SourceId;
    Row.SubmissionId = Data.submissionId;
    Row.Environment = Environment;
    Row.MeterExternalId = Data.meterExternalId;
    Row.AccountExternalId = Data.accountExternalId;
    Row.BillingPeriod = Data.period;
    Row.Value = Data.value;
    Row.Previous = Data.previous;
    Row.ReceivedAt = CurrentDate();
    Row.Write();
    Return False;
EndFunction

Function ApplyMessage(SourceId, Environment, JSON) Export
    Message = Decode(JSON);
    CheckKeys(Message, "messageId,kind,payload");
    CheckText(Message.messageId);
    If Message.kind <> "readings" And Message.kind <> "work_results"
        And Message.kind <> "work_reopened" And Message.kind <> "service_acts" Then Raise "UNSUPPORTED_KIND"; EndIf;
    PayloadHash = Digest(Message);
    BeginTransaction();
    Try
        SourceRecord(SourceId, Environment, True);
        Receipt = Record("WH_Inbox", SourceId, "MessageId", Message.messageId);
        If Receipt.Selected() Then
            If Receipt.PayloadHash <> PayloadHash Then Raise "MESSAGE_CONFLICT"; EndIf;
            CommitTransaction();
            Return Encode(New Structure("accepted,duplicate", True, True));
        EndIf;
        If Message.kind = "readings" Then
            Duplicate = StoreReading(SourceId, Environment, Message.payload);
        Else
            Duplicate = StoreWorkEvent(SourceId, Environment, Message.kind, Message.payload);
        EndIf;
        Receipt.SourceId = SourceId;
        Receipt.MessageId = Message.messageId;
        Receipt.Environment = Environment;
        Receipt.Kind = Message.kind;
        Receipt.PayloadHash = PayloadHash;
        Receipt.ReceivedAt = CurrentDate();
        Receipt.Write();
        // The COM method returns only after native 1C COMMIT succeeds.
        CommitTransaction();
        Return Encode(New Structure("accepted,duplicate", True, Duplicate));
    Except
        RollbackTransaction();
        Raise;
    EndTry;
EndFunction

Function InspectState(SourceId, Environment) Export
    SourceRecord(SourceId, Environment);
    Result = New Structure;
    For Each Name In StrSplit("WH_Accounts,WH_Meters,WH_Readings,WH_Inbox,WH_Outbox,WH_WorkEvents", ",") Do
        Rows = QueryRows("SELECT COUNT(*) AS Quantity FROM InformationRegister." + Name + " WHERE SourceId = &SourceId", SourceId);
        Rows.Next();
        Result.Insert(Name, Rows.Quantity);
    EndDo;
    Return Encode(Result);
EndFunction

Procedure CheckVersion(Value)
    CheckNumber(Value);
    If Value < 1 Or Value > 9999999999 Or Int(Value) <> Value Then Raise "INVALID_VERSION"; EndIf;
EndProcedure

Procedure CheckMoney(Value)
    CheckNumber(Value);
    If Round(Value, 2) <> Value Then Raise "INVALID_MONEY"; EndIf;
EndProcedure

Function StoreWorkEvent(SourceId, Environment, Kind, Data)
    If Kind = "work_results" Then
        CheckKeys(Data, "schemaVersion,ticketId,number,accountExternalId,termsVersion,resultVersion,amount,acceptedBy,acceptedAt");
        CheckText(Data.number, 300);
        CheckVersion(Data.termsVersion);
        CheckVersion(Data.resultVersion);
        CheckMoney(Data.amount);
        CheckText(Data.acceptedBy);
        CheckText(Data.acceptedAt, 40);
        // Read JSON's ISO timestamp using the platform parser, not local timezone guesses.
        ISODate(Left(Data.acceptedAt, 10));
        EventKey = Kind + ":" + Data.ticketId + ":" + Format(Data.resultVersion, "NG=0");
    ElsIf Kind = "work_reopened" Then
        CheckKeys(Data, "schemaVersion,ticketId,accountExternalId,previousResultVersion,resultVersion,reason");
        CheckVersion(Data.previousResultVersion);
        CheckVersion(Data.resultVersion);
        If Data.resultVersion <> Data.previousResultVersion + 1 Then Raise "INVALID_RESULT_VERSION"; EndIf;
        CheckText(Data.reason, 10000);
        EventKey = Kind + ":" + Data.ticketId + ":" + Format(Data.resultVersion, "NG=0");
    Else
        CheckKeys(Data, "schemaVersion,actId,number,date,ticketId,accountExternalId,total,lines");
        CheckText(Data.actId);
        CheckText(Data.number, 300);
        ISODate(Data.date);
        CheckMoney(Data.total);
        If TypeOf(Data.lines) <> Type("Array") Then Raise "INVALID_ACT_LINES"; EndIf;
        If Data.lines.Count() < 1 Or Data.lines.Count() > 200 Then Raise "INVALID_ACT_LINES"; EndIf;
        Total = 0;
        For Each Line In Data.lines Do
            CheckKeys(Line, "kind,catalogId,description,unit,quantity,unitPrice,vatRate,net,vat,total");
            If Line.kind <> "labor" And Line.kind <> "material" And Line.kind <> "service" Then Raise "INVALID_ACT_LINES"; EndIf;
            If Line.catalogId <> Undefined Then CheckText(Line.catalogId); EndIf;
            CheckText(Line.description, 300);
            CheckText(Line.unit, 300);
            CheckNumber(Line.quantity);
            CheckNumber(Line.unitPrice);
            If Line.quantity <= 0 Or Line.quantity > 1000000 Or Line.unitPrice > 10000000 Then Raise "INVALID_ACT_LINES"; EndIf;
            If Line.vatRate <> "0" And Line.vatRate <> "5" And Line.vatRate <> "7" And Line.vatRate <> "10" And Line.vatRate <> "20" And Line.vatRate <> "22" Then Raise "INVALID_ACT_LINES"; EndIf;
            CheckMoney(Line.net);
            CheckMoney(Line.vat);
            CheckMoney(Line.total);
            If Round(Line.quantity * Line.unitPrice, 2) <> Line.net
                Or Round(Line.net * Number(Line.vatRate) / 100, 2) <> Line.vat
                Or Line.net + Line.vat <> Line.total Then Raise "ACT_TOTAL_MISMATCH"; EndIf;
            Total = Total + Line.total;
        EndDo;
        If Total <> Data.total Then Raise "ACT_TOTAL_MISMATCH"; EndIf;
        EventKey = Kind + ":" + Data.actId;
    EndIf;
    If TypeOf(Data.schemaVersion) <> Type("Number") Or Data.schemaVersion <> 1 Then Raise "UNSUPPORTED_SCHEMA"; EndIf;
    CheckText(Data.ticketId);
    CheckText(Data.accountExternalId);
    Account = Record("WH_Accounts", SourceId, "ExternalId", Data.accountExternalId);
    If Not Account.Selected() Then Raise "ACCOUNT_NOT_FOUND"; EndIf;
    // Historical accepted work can arrive after closure. Its contract must still exist.
    VerifyBPContract(Account.LeaseExternalId);
    Row = Record("WH_WorkEvents", SourceId, "EventKey", EventKey);
    PayloadHash = Digest(Data);
    If Row.Selected() Then
        If Row.PayloadHash <> PayloadHash Then Raise "WORK_EVENT_CONFLICT"; EndIf;
        Return True;
    EndIf;
    Row.SourceId = SourceId;
    Row.EventKey = EventKey;
    Row.Environment = Environment;
    Row.Kind = Kind;
    Row.AccountExternalId = Data.accountExternalId;
    Row.Payload = Encode(Data);
    Row.PayloadHash = PayloadHash;
    Row.ReceivedAt = CurrentDate();
    Row.Write();
    Return False;
EndFunction

Function GetWorkEvent(SourceId, Environment, EventKey) Export
    SourceRecord(SourceId, Environment);
    CheckText(EventKey, 300);
    Row = Record("WH_WorkEvents", SourceId, "EventKey", EventKey);
    If Not Row.Selected() Then Return "null"; EndIf;
    Return Row.Payload;
EndFunction

Function GetReading(SourceId, Environment, SubmissionId) Export
    SourceRecord(SourceId, Environment);
    CheckText(SubmissionId);
    Row = Record("WH_Readings", SourceId, "SubmissionId", SubmissionId);
    If Not Row.Selected() Then Return "null"; EndIf;
    Return Encode(New Structure("submissionId,meterExternalId,accountExternalId,period,value,previous",
        Row.SubmissionId, Row.MeterExternalId, Row.AccountExternalId, Row.BillingPeriod, Row.Value, Row.Previous));
EndFunction
