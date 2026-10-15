output "dashboard_url" {
  description = "Open this in a browser"
  value       = "http://${aws_lb.main.dns_name}"
}

output "api_docs_url" {
  value = "http://${aws_lb.main.dns_name}/swagger-ui.html"
}

output "ecr_backend_repository" {
  value = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository" {
  value = aws_ecr_repository.frontend.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}
