resource "aws_ses_domain_identity" "probonoai" {
  domain = "probonoai.com.au"
}

resource "aws_ses_domain_dkim" "probonoai" {
  domain = aws_ses_domain_identity.probonoai.domain
}
