let
    PromoteHeaderByMarkers = (InputTable as table, Markers as list) as table =>
        let
            Rows = Table.ToRows(InputTable),
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
            FromHeader = Table.Skip(InputTable, HeaderIndex),
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
        {"Operation", "Operation Name", "Operation Team OPS/GLO Main Division Short Name"}
    ),
    BOSelectedColumns = Table.SelectColumns(
        BOPromotedHeaders,
        {"Operation", "PIN/GNG Validation Date", "Operation AFS Validation Date", "Operation Team OPS/GLO Main Division Short Name"},
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
        {"PIN/GNG Validation Date", "Operation AFS Validation Date", "Operation Team OPS/GLO Main Division Short Name"},
        {"BO PIN/GNG Validation Date", "BO Operation AFS Validation Date", "BO Operation Team OPS/GLO Main Division Short Name"}
    ),
    BOValidationDate = Table.AddColumn(
        ExpandedBO,
        "BO Validation Date",
        each
            let TemplateType = try Text.Upper(Text.Trim(Text.From([Template]))) otherwise ""
            in
                if TemplateType = "OTHER" then null
                else if TemplateType = "AFS" then [#"BO Operation AFS Validation Date"]
                else if TemplateType = "GNG" or TemplateType = "PIN" then [#"BO PIN/GNG Validation Date"]
                else null,
        type date
    ),
    TemplateCheckedBO = Table.AddColumn(
        BOValidationDate,
        "BO Operation Team OPS/GLO Main Division Short Name Template Checked",
        each if (try Text.Upper(Text.Trim(Text.From([Template]))) otherwise "") = "OTHER"
            then null
            else [#"BO Operation Team OPS/GLO Main Division Short Name"],
        type text
    ),
    RemovedRawBO = Table.RemoveColumns(
        TemplateCheckedBO,
        {"BO PIN/GNG Validation Date", "BO Operation AFS Validation Date", "BO Operation Team OPS/GLO Main Division Short Name"}
    ),
    MasterTable = Table.RenameColumns(
        RemovedRawBO,
        {{"BO Operation Team OPS/GLO Main Division Short Name Template Checked", "BO Operation Team OPS/GLO Main Division Short Name"}}
    )
in
    MasterTable
