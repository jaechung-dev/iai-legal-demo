# ── Route53 hosted zone ───────────────────────────────────────────────────────

resource "aws_route53_zone" "main" {
  name = "probonoai.com.au"
}

# After first apply, take the nameservers from the output below and update
# GoDaddy: Domain Settings → Nameservers → Custom → paste all 4 values.
output "nameservers" {
  description = "Set these as custom nameservers in GoDaddy — one-time step to cut over from Cloudflare"
  value       = aws_route53_zone.main.name_servers
}

# ── CloudFront — apex, www, preview ───────────────────────────────────────────

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "probonoai.com.au"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.probonoai.com.au"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "preview" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "preview.probonoai.com.au"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

# ── ACM cert validation (frontend — us-east-1) ────────────────────────────────
# Replaces the manual "add these to GoDaddy" step in cert.tf outputs.

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.frontend.domain_validation_options : dvo.domain_name => dvo
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

# ── API Gateway custom domain (api.probonoai.com.au) ─────────────────────────
# Regional cert — API Gateway uses ap-southeast-2, not us-east-1 like CloudFront.

resource "aws_acm_certificate" "api" {
  domain_name       = "api.probonoai.com.au"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "api_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.api.domain_validation_options : dvo.domain_name => dvo
  }
  zone_id = aws_route53_zone.main.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [for r in aws_route53_record.api_cert_validation : r.fqdn]
}

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = "api.probonoai.com.au"
  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.probonoai.com.au"
  type    = "A"
  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ── SES — email deliverability ────────────────────────────────────────────────
# Replaces the manual outputs in ses.tf.

resource "aws_route53_record" "ses_verification" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_amazonses.probonoai.com.au"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.probonoai.verification_token]
}

resource "aws_route53_record" "ses_dkim" {
  count   = 3
  zone_id = aws_route53_zone.main.zone_id
  name    = "${aws_ses_domain_dkim.probonoai.dkim_tokens[count.index]}._domainkey.probonoai.com.au"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.probonoai.dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# SPF — tells receiving servers that SES is authorised to send for this domain
resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "probonoai.com.au"
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# DMARC — p=none = monitoring only; upgrade to p=quarantine once email is confirmed working
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.probonoai.com.au"
  type    = "TXT"
  ttl     = 600
  records = ["v=DMARC1; p=none; rua=mailto:noreply@probonoai.com.au"]
}
