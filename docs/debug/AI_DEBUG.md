# AI Debug Log

> **Last Updated**: 2025-01-12
> **Audience**: Developers

This file contains debug logs for AI extraction calls when `AI_DEBUG=true`.

## Related Documents

- [Document Processing / Extraction](../features/document-processing/EXTRACTION.md) - AI extraction details
- [Environment Variables](../reference/ENVIRONMENT_VARIABLES.md) - Configuration options

## How to Enable Debug Logging

Set the following environment variable in your `.env` file:

```bash
AI_DEBUG=true
```

When enabled, the system automatically appends detailed AI call logs to **this file** (`docs/AI_DEBUG.md`).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_DEBUG` | `false` | Enable AI debug logging to this file |
| `AI_DEBUG_LOG_PROMPTS` | `true` | Include full prompts in logs |
| `AI_DEBUG_LOG_RESPONSES` | `true` | Include full AI responses in logs |
| `AI_DEBUG_LOG_IMAGES` | `false` | Include image metadata in logs |

## Log Format

Each AI call logs:
1. **Request Details** - Model, provider, operation, tenant, temperature, COA context
2. **Prompt** - Full extraction prompt (collapsible)
3. **Response** - Status, latency, token counts, estimated cost, raw response (collapsible)
4. **Extraction Results** - Document fields and line item account codes

## Troubleshooting Account Code Assignment

### Common Issues

1. **No account code assigned** (`❌ NOT ASSIGNED`)
   - Check if COA context was included (look for `COA Context: Yes`)
   - Verify tenant has chart of accounts configured in 4xxx-8xxx range
   - Review the prompt to ensure accounts are listed

2. **Wrong account code assigned**
   - Check the AI response for the `accountCode` field
   - Review the description and compare to available accounts
   - Consider adding more specific accounts to COA

3. **Low confidence scores** (< 0.7)
   - AI is uncertain about the mapping
   - Review the line item description for clarity
   - Consider manual assignment for edge cases

### Expected Account Code Ranges

- **4xxx**: Revenue accounts (sales, service income)
- **5xxx**: Cost of goods sold (direct costs, purchases)
- **6xxx-7xxx**: Operating expenses (admin, marketing, utilities)
- **8xxx**: Tax expenses (income tax, deferred tax)

## Clearing Logs

To clear this log file, you can:
1. Delete everything below the `---` line manually
2. Or use the `clearDebugLog()` function programmatically

---


## AI Request - 2026-03-07T16:16:38.397Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_translation |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | 0.1 |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 71568ms |
| Input Tokens | 6232 |
| Output Tokens | 5628 |
| Total Tokens | 11860 |
| Estimated Cost | $0.0175 |

<details>
<summary>Response (5477 chars)</summary>

```json
{
  "translations": {
    "form.title": "KYC/CDD 个人声明表",
    "ui.language_label": "语言",
    "ui.back": "返回",
    "ui.continue": "继续",
    "ui.submit": "提交",
    "ui.preview_mode": "预览模式",
    "ui.upload_file": "上传文件",
    "ui.replace_file": "替换文件",
    "ui.upload_drag_hint": "或将文件拖放到此处",
    "ui.upload_select_prompt": "选择要上传的文件",
    "ui.uploading": "正在上传...",
    "ui.upload_success": "文件上传成功",
    "ui.add_row": "添加行",
    "ui.remove_row": "删除行",
    "ui.save_draft": "保存草稿",
    "ui.saving_draft": "正在保存草稿...",
    "ui.copy_resume_link": "复制恢复链接",
    "ui.draft_saved": "草稿已保存。请保留此代码和恢复链接以便稍后继续。",
    "ui.draft_code_label": "草稿代码",
    "ui.draft_expires_label": "到期",
    "ui.response_submitted_title": "提交成功",
    "ui.response_submitted_description": "您的回复已记录。",
    "ui.download_pdf": "下载 PDF",
    "ui.download_expired_hint": "下载链接已过期。请重新提交表单以生成新链接。",
    "ui.email_pdf_copy": "以电子邮件发送 PDF 副本",
    "ui.send": "发送",
    "field.instruction.label": "说明",
    "field.instruction_detail.label": "说明详情",
    "field.instruction_detail.subtext": "<p></p><p><strong>开始前</strong></p><p>此表格大约需要 5 分钟完成。</p><p>为确保顺利提交，请提前准备以下文件：</p><ul><li><p>新加坡 NRIC，或</p></li><li><p>护照及居住地址证明</p></li></ul><p>提前准备这些文件可帮助您顺利完成表格。</p><p></p>",
    "field.section_a_personal_information.label": "A 部分：个人信息",
    "field.full_name.label": "全名",
    "field.full_name.placeholder": "证件姓名",
    "field.gender.label": "性别",
    "field.gender.option.0": "男",
    "field.gender.option.1": "女",
    "field.date_of_birth.label": "出生日期",
    "field.nationality.label": "国籍",
    "field.nric_fin_passport_number.label": "NRIC/FIN/护照号码",
    "field.issuing_country.label": "签发国家",
    "field.expiry_date_passport_only.label": "到期日（仅适用于护照）",
    "field.residential_address.label": "居住地址",
    "field.phone.label": "电话（请包含国家/地区代码）",
    "field.email.label": "电子邮件",
    "field.section_b_occupation_business.label": "B 部分：职业/业务",
    "field.occupation_profession.label": "职业",
    "field.employer_business_name.label": "雇主/公司名称",
    "field.nature_of_industry_business.label": "行业/业务性质",
    "field.highest_education_level.label": "最高学历",
    "field.highest_education_level.option.0": "小学",
    "field.highest_education_level.option.1": "中学/高中",
    "field.highest_education_level.option.2": "大专/高等教育",
    "field.highest_education_level.option.3": "学士学位",
    "field.highest_education_level.option.4": "硕士/博士/职业资格",
    "field.section_c_source_of_funds_wealth.label": "C 部分：资金/财富来源",
    "field.source_of_funds.label": "资金来源",
    "field.source_of_funds.option.0": "雇佣收入，包括经营所得",
    "field.source_of_funds.option.1": "租金收入",
    "field.source_of_funds.option.2": "继承",
    "field.source_of_funds.option.3": "资产出售",
    "field.source_of_funds.option.4": "投资",
    "field.source_of_funds.option.5": "其他",
    "field.section_d_regulatory_and_criminal_disclosure.label": "D 部分：监管与刑事披露",
    "field.section_d_information.label": "D 部分 信息",
    "field.section_d_information.subtext": "<p>在新加坡或任何其他司法辖区，您是否曾经（过去、现在或正在）：</p>",
    "field.criminal_check.label": "是否曾受到刑事调查、起诉或定罪，包括但不限于欺诈、贿赂、腐败或洗钱等罪行",
    "field.criminal_check.option.0": "是",
    "field.criminal_check.option.1": "否",
    "field.criminal_check_detail.label": "刑事情况详情",
    "field.criminal_check_detail.placeholder": "请说明",
    "field.bankrupt_check.label": "是否已宣布破产、被裁定无力偿债，或参与任何正式或非正式的债务和解安排",
    "field.bankrupt_check.option.0": "是",
    "field.bankrupt_check.option.1": "否",
    "field.bankrupt_check_detail.label": "破产情况详情",
    "field.bankrupt_check_detail.placeholder": "请说明",
    "field.proceeding_check.label": "是否涉及民事或监管程序或调查，并且您被、可能被或曾被认定对不当行为、疏忽或违反职业或受托义务负责",
    "field.proceeding_check.option.0": "是",
    "field.proceeding_check.option.1": "否",
    "field.proceeding_check_detail.label": "诉讼/程序详情",
    "field.proceeding_check_detail.placeholder": "请说明",
    "field.disciplinary_check.label": "是否受到任何监管机构（例如 MAS、ACRA、IRAS 或国外同等机构）的纪律或执法行动，或曾被拒绝或撤销任何执照、注册或职业会员资格",
    "field.disciplinary_check.option.0": "是",
    "field.disciplinary_check.option.1": "否",
    "field.disciplinary_check_detail.label": "纪律/执法情况详情",
    "field.disciplinary_check_detail.placeholder": "请说明",
    "field.sanctions_check.label": "是否被列入政府、国际组织或监管机构维护的任何制裁或观察名单（例如 OFAC、联合国、欧盟）",
    "field.sanctions_check.option.0": "是",
    "field.sanctions_check.option.1": "否",
    "field.sactions_check_details.label": "制裁检查详情",
    "field.sactions_check_details.placeholder": "请说明",
    "field.disqualification_check.label": "是否被取消担任公司董事的资格（根据《公司法》或新加坡或任何其他司法辖区的同等法律），无论是通过法院命令、法定取消资格或自愿承诺",
    "field.disqualification_check.option.0": "是",
    "field.disqualification_check.option.1": "否",
    "field.disqualification_check_detail.label": "取消资格详情",
    "field.disqualification_check_detail.placeholder": "请说明",
    "field.section_e_risk_assessment.label": "E 部分：风险评估",
    "field.section_e_information.label": "E 部分 信息",
    "field.section_e_information.subtext": "<p>政治敏感人物（PEP）是指现任或曾任重要公共职务的个人，包括国家元首、高级政治人物、高级政府官员、司法或军事官员、国有企业高级管理人员以及政党高级官员。</p>",
    "field.politically_exposed_person_pep_status.label": "政治敏感人物（PEP）状态",
    "field.politically_exposed_person_pep_status.option.0": "我不是政治敏感人物。",
    "field.politically_exposed_person_pep_status.option.1": "我是政治敏感人物。",
    "field.politically_exposed_person_pep_status.option.2": "我是政治敏感人物的家庭成员或密切关系人。",
    "field.position.label": "职位",
    "field.pep_country.label": "国家",
    "field.name_of_pep.label": "政治敏感人物姓名",
    "field.pep_relationship.label": "关系",
    "field.jurisdictional_risk.label": "司法辖区风险",
    "field.jurisdictional_risk.option.0": "我不是 FATF 认定的高风险司法辖区的居民或公民。",
    "field.jurisdictional_risk.option.1": "我是 FATF 认定的高风险司法辖区的居民或公民。",
    "field.jurisdictional_risk_details.label": "司法辖区风险详情",
    "field.nominee_status.label": "名义身份",
    "field.nominee_status.option.0": "我并非担任名义董事或名义股东。",
    "field.nominee_status.option.1": "我以名义身份行事。",
    "field.capacity.label": "身份",
    "field.capacity.option.0": "名义董事",
    "field.capacity.option.1": "名义股东",
    "field.name_of_nominator_beneficial_owner.label": "提名人/受益所有人姓名",
    "field.nominator_s_id_passport_no.label": "提名人身份证/护照号码",
    "field.attachment.label": "附件",
    "field.supporting_documents.label": "支持文件",
    "field.supporting_documents.option.0": "新加坡 NRIC"
  }
}
```
</details>

---

## AI Request - 2026-03-07T16:17:51.052Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_translation |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | 0.1 |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 21741ms |
| Input Tokens | 771 |
| Output Tokens | 1782 |
| Total Tokens | 2553 |
| Estimated Cost | $0.0043 |

<details>
<summary>Response (871 chars)</summary>

```json
{
  "translations": {
    "field.supporting_documents.option.1": "护照/ 地址证明",
    "field.nric.label": "NRIC",
    "field.passport.label": "护照",
    "field.proof_of_address.label": "地址证明",
    "field.section_g_declaration_and_acknowledgement.label": "G 部分：声明与确认",
    "field.declaration.label": "声明",
    "field.declaration.subtext": "<p>我声明，本表格中提供的所有信息据我所知均真实、准确且完整。我理解提供虚假或误导性信息构成《Corporate Services Providers Act 2024》及适用新加坡法律下的违法行为，可能导致服务终止、罚款或其他法律后果。</p><p>我在此同意在必要时通过独立且可靠的渠道对所提供信息进行核实。我亦知悉风险评估的结果可能在必要时导致采取加强尽职调查（Enhanced Due Diligence，EDD）措施。</p><p>如上述信息或声明有任何变更，我承诺在5个工作日内通知 OakTree Accounting &amp; Corporate Solutions Pte Ltd。</p><p>通过在下方签名，我确认已阅读并理解本KYC/CDD声明表格的内容，并同意为遵守反洗钱/打击资助恐怖主义/打击资助扩散（AML/CFT/PF）相关合规目的，按照《个人资料保护法 (PDPA)》及本组织的隐私政策收集、使用和披露我的个人资料。</p>",
    "field.signature.label": "签名",
    "field.full_name_declaration.label": "全名",
    "field.designation_declaration.label": "职务",
    "field.date_declaration.label": "日期"
  }
}
```
</details>

---

## AI Request - 2026-03-07T16:45:26.474Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_translation |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | 0.1 |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 6699ms |
| Input Tokens | 210 |
| Output Tokens | 362 |
| Total Tokens | 572 |
| Estimated Cost | $0.0009 |

<details>
<summary>Response (113 chars)</summary>

```json
{
  "translations": {
    "ui.resume_draft": "恢复草稿",
    "ui.resuming_draft": "正在恢复...",
    "ui.resume_draft_placeholder": "输入草稿 ID"
  }
}
```
</details>

---

## AI Request - 2026-03-07T17:00:22.312Z

### Request Details
| Field | Value |
|-------|-------|
| Operation | form_translation |
| Model | gpt-5-mini |
| Provider | openai |
| Tenant | b117cdc7-bdbb-4597-9a79-af14faf67dc4 |
| User | 1ff281ab-4946-434e-8318-f357dee1661a |
| Temperature | 0.1 |
| JSON Mode | true |
| COA Context | No |

### Response
| Field | Value |
|-------|-------|
| Status | ✅ Success |
| Latency | 27669ms |
| Input Tokens | 1792 |
| Output Tokens | 2548 |
| Total Tokens | 4340 |
| Estimated Cost | $0.0069 |

<details>
<summary>Response (1842 chars)</summary>

```json
{
  "translations": {
    "ui.preview_notice": "预览模式。发布表单以接受上传和提交。",
    "ui.page_progress": "第 {current} 页，共 {total} 页",
    "ui.page_progress_short": "{current} / {total}",
    "ui.upload_failed": "上传失败",
    "ui.uploaded_file_fallback": "已上传的文件",
    "ui.upload_file_for_field": "为 {field} 上传文件",
    "ui.phone_code_placeholder": "区号",
    "ui.date_placeholder": "dd/mm/yyyy",
    "ui.select_option_placeholder": "请选择一个选项",
    "ui.choice_other_placeholder": "请说明",
    "ui.loading_form": "正在加载表单...",
    "ui.information_image_alt": "信息图片",
    "ui.info_image_invalid_url": "在字段设置中添加有效的图片 URL。",
    "ui.info_url_invalid_url": "在字段设置中添加有效的 URL。",
    "ui.organization_logo_alt": "组织徽标",
    "ui.draft_validity_notice_singular": "草稿将在 {days} 天内保持可用。",
    "ui.draft_validity_notice_plural": "草稿将在 {days} 天内保持可用。",
    "ui.resume_draft_description_singular": "草稿将在 {days} 天内保持可用。如果要继续已保存的答复，请输入草稿 ID。",
    "ui.resume_draft_description_plural": "草稿将在 {days} 天内保持可用。如果要继续已保存的答复，请输入草稿 ID。",
    "ui.draft_saved_title": "草稿已保存",
    "ui.resume_link_label": "恢复链接",
    "ui.continue_editing": "继续编辑",
    "ui.preview_upload_notice": "预览模式为只读。发布表单以接受上传。",
    "ui.preview_save_draft_notice": "预览模式为只读。发布表单以保存草稿。",
    "ui.draft_save_disabled_notice": "此表单未启用草稿保存功能。",
    "ui.save_draft_failed": "保存草稿失败",
    "ui.resume_draft_failed": "恢复草稿失败",
    "ui.resume_link_unavailable": "此浏览器无法使用恢复链接。",
    "ui.resume_link_copied": "恢复链接已复制。",
    "ui.resume_link_copy_failed": "复制恢复链接失败。",
    "ui.preview_submit_notice": "预览模式为只读。发布表单以接受提交。",
    "ui.submission_failed": "提交失败",
    "ui.email_pdf_placeholder": "name@example.com",
    "ui.email_action_expired": "此邮件操作已过期。请重新提交表单以请求 PDF 邮件。",
    "ui.email_invalid": "请输入有效的电子邮件地址",
    "ui.email_send_failed": "发送邮件失败",
    "ui.email_sent_feedback": "PDF 链接已发送至 {email}",
    "ui.validation_required": "{field} 为必填项",
    "ui.validation_email": "{field} 必须是有效的电子邮件地址",
    "ui.validation_choice_detail": "{field}：请为 {option} 进行说明",
    "ui.invalid_value": "无效值",
    "ui.payload_label": "有效载荷",
    "ui.dynamic_section_unsupported_field": "此字段类型在动态分区中尚不受支持。"
  }
}
```
</details>

---

