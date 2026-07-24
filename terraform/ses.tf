resource "aws_ses_domain_identity" "probonoai" {
  domain = "probonoai.com.au"
}

resource "aws_ses_domain_dkim" "probonoai" {
  domain = aws_ses_domain_identity.probonoai.domain
}

output "ses_domain_verification" {
  description = "Add this TXT record to GoDaddy to verify the SES sending domain"
  value = {
    name  = "_amazonses.probonoai.com.au"
    type  = "TXT"
    value = aws_ses_domain_identity.probonoai.verification_token
  }
}

output "ses_dkim_records" {
  description = "Add these 3 CNAME records to GoDaddy for DKIM signing (improves deliverability)"
  value = [for token in aws_ses_domain_dkim.probonoai.dkim_tokens : {
    name  = "${token}._domainkey.probonoai.com.au"
    type  = "CNAME"
    value = "${token}.dkim.amazonses.com"
  }]
}
