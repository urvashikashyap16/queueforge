variable "region" {
  description = "AWS region (ap-south-1 = Mumbai)"
  type        = string
  default     = "ap-south-1"
}

variable "name" {
  description = "Prefix for all resource names"
  type        = string
  default     = "queueforge"
}

variable "image_tag" {
  description = "Container image tag to deploy (CI passes the git SHA)"
  type        = string
  default     = "latest"
}

variable "backend_desired_count" {
  description = "Number of API/worker tasks. Every task is also a worker, so this scales processing."
  type        = number
  default     = 2
}

variable "backend_max_count" {
  description = "Upper bound for CPU-based autoscaling of backend tasks"
  type        = number
  default     = 6
}

variable "worker_concurrency" {
  description = "Worker threads per backend task"
  type        = number
  default     = 8
}

variable "db_instance_class" {
  description = "RDS instance size (db.t4g.micro is free-tier eligible)"
  type        = string
  default     = "db.t4g.micro"
}
