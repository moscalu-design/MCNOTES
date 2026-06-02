let
    PromoteHeaderByMarkers = (InputTable as table, Markers as list) as table =>
        let
            CleanInput = Table.ReplaceErrorValues(
                InputTable,
                List.Transform(Table.ColumnNames(InputTable), each {_, null})
            ),
            Rows = Table.ToRows(CleanInput),
            TextRows = List.Transform(
                Rows,
                each List.Transform(_, each try Text.Trim(Text.From(_)) otherwise "")
            ),
            Scores = List.Transform(
                TextRows,
                each List.Count(List.Intersect({_, Markers}))
            ),
            BestScore = List.Max(Scores),
            HeaderIndex = if BestScore = 0 then 0 else List.PositionOf(Scores, BestScore),
            FromHeader = Table.Skip(CleanInput, HeaderIndex),
            Promoted = Table.PromoteHeaders(FromHeader, [PromoteAllScalars=true])
        in
            Promoted,

    MCSource = Excel.Workbook(File.Contents("C:\Users\moscalu\Desktop\MC Notes\Data Analysis\MC_Note_Datebase.xlsx"), null, true),
    MCDatabaseRaw = MCSource{[Item="Database", Kind="Sheet"]}[Data],
    MCPromotedHeaders = PromoteHeaderByMarkers(
        MCDatabaseRaw,
        {"Source", "Template", "Extraction", "File Name", "Operation Number"}
    ),
    MCSelectedColumns = Table.SelectColumns(
        MCPromotedHeaders,
        {"Source", "Template", "Extraction", "MC_Note_Type", "File Name", "Operation Number", "Validation Date", "Author", "Document Page Count", "Page count before opinion", "Annex Page Count", "Text Before Opinions", "OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON", "CFC", "EIF", "FI", "IG", "PMM", "SG", "GIS", "HR", "OTHER"},
        MissingField.UseNull
    ),
    MCOperationTyped = Table.TransformColumns(
        MCSelectedColumns,
        {{"Operation Number", each try Int64.From(_) otherwise null, Int64.Type}}
    ),

    BOSource = Excel.Workbook(File.Contents("C:\Users\moscalu\Desktop\MC Notes\Data Analysis\BO_Data_Projects.xlsx"), null, true),
    BODataRaw = BOSource{[Item="BO Data", Kind="Sheet"]}[Data],
    BOPromotedHeaders = PromoteHeaderByMarkers(
        BODataRaw,
        {"Operation", "Operation Name", "Operation Team OPS/GLO Main Division Short Name", "New AFS Process"}
    ),
    BOSelectedColumns = Table.SelectColumns(
        BOPromotedHeaders,
        {"Operation", "Financing Product Name", "Operation Special Activities Flag", "PIN/GNG Validation Date", "Operation AFS Validation Date", "Operation Team OPS/GLO Main Division Short Name", "TEAM PJ", "TEAM RM", "TEAM JU", "Operation Team SG Main Division Short Name", "New AFS Process"},
        MissingField.UseNull
    ),
    BOOperationTyped = Table.TransformColumns(
        BOSelectedColumns,
        {{"Operation", each try Int64.From(_) otherwise null, Int64.Type}}
    ),
    BODeduped = Table.Distinct(BOOperationTyped, {"Operation"}),
    JoinedBO = Table.NestedJoin(
        MCOperationTyped,
        {"Operation Number"},
        BODeduped,
        {"Operation"},
        "BO",
        JoinKind.LeftOuter
    ),
    ExpandedBO = Table.ExpandTableColumn(
        JoinedBO,
        "BO",
        {"Financing Product Name", "Operation Special Activities Flag", "PIN/GNG Validation Date", "Operation AFS Validation Date", "Operation Team OPS/GLO Main Division Short Name", "TEAM PJ", "TEAM RM", "TEAM JU", "Operation Team SG Main Division Short Name", "New AFS Process"},
        {"BO Financing Product Name", "BO Operation Special Activities Flag", "BO PIN/GNG Validation Date", "BO Operation AFS Validation Date", "BO Operation Team OPS/GLO Main Division Short Name", "BO TEAM PJ", "BO TEAM RM", "BO TEAM JU", "BO Operation Team SG Main Division Short Name", "BO New AFS Process"}
    ),
    BOValidationDate = Table.AddColumn(
        ExpandedBO,
        "BO Validation Date",
        each
            let
                TemplateType = try Text.Upper(Text.Trim(Text.From([Template]))) otherwise "",
                MCValidationDate = try Date.From([#"Validation Date"]) otherwise null,
                BOAFSValidationDate = try Date.From([#"BO Operation AFS Validation Date"]) otherwise null,
                BOPINGNGValidationDate = try Date.From([#"BO PIN/GNG Validation Date"]) otherwise null
            in
                if TemplateType = "OTHER" then MCValidationDate
                else if TemplateType = "AFS" then BOAFSValidationDate
                else if TemplateType = "GNG" or TemplateType = "PIN" then BOPINGNGValidationDate
                else null,
        type date
    ),
    TemplateCheckedBO = Table.AddColumn(
        BOValidationDate,
        "BO Author (OPS/GLO) Template Checked",
        each if (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise "") = "OTHER"
            then null
            else [#"BO Operation Team OPS/GLO Main Division Short Name"],
        type text
    ),
    BOProductName = Table.AddColumn(
        TemplateCheckedBO,
        "Financing Product Name",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO Financing Product Name"]
            else null,
        type text
    ),
    BOSpecialActivitiesFlag = Table.AddColumn(
        BOProductName,
        "Operation Special Activities Flag",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO Operation Special Activities Flag"]
            else null,
        type text
    ),
    BOServiceTeamPJ = Table.AddColumn(
        BOSpecialActivitiesFlag,
        "BO PJ",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO TEAM PJ"]
            else null,
        type text
    ),
    BOServiceRM = Table.AddColumn(
        BOServiceTeamPJ,
        "BO RM",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO TEAM RM"]
            else null,
        type text
    ),
    BOServiceJU = Table.AddColumn(
        BOServiceRM,
        "BO JU",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO TEAM JU"]
            else null,
        type text
    ),
    BOServiceECON = Table.AddColumn(
        BOServiceJU,
        "BO ECON",
        each if List.Contains({"AFS", "GNG"}, (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""))
            then [#"BO Operation Team SG Main Division Short Name"]
            else null,
        type text
    ),
    NewAFSProcess = Table.AddColumn(
        BOServiceECON,
        "New AFS Process",
        each if (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise "") = "AFS"
            then [#"BO New AFS Process"]
            else "N/A",
        type text
    ),
    RemovedRawBO = Table.RemoveColumns(
        NewAFSProcess,
        {"BO Financing Product Name", "BO Operation Special Activities Flag", "BO PIN/GNG Validation Date", "BO Operation AFS Validation Date", "BO Operation Team OPS/GLO Main Division Short Name", "BO TEAM PJ", "BO TEAM RM", "BO TEAM JU", "BO Operation Team SG Main Division Short Name", "BO New AFS Process"}
    ),
    MasterTable = Table.RenameColumns(
        RemovedRawBO,
        {{"BO Author (OPS/GLO) Template Checked", "BO Author (OPS/GLO)"}}
    ),
    OrderedMasterTable = Table.ReorderColumns(
        MasterTable,
        {"Source", "Template", "Extraction", "MC_Note_Type", "File Name", "Operation Number", "Financing Product Name", "Operation Special Activities Flag", "New AFS Process", "Validation Date", "Author", "BO Validation Date", "BO Author (OPS/GLO)", "Document Page Count", "Page count before opinion", "Annex Page Count", "Text Before Opinions", "OPS", "GLO", "PJ", "RM", "OCCO", "JU", "ECON", "CFC", "EIF", "FI", "IG", "PMM", "SG", "GIS", "HR", "OTHER", "BO PJ", "BO RM", "BO JU", "BO ECON"},
        MissingField.Ignore
    )
in
    OrderedMasterTable
