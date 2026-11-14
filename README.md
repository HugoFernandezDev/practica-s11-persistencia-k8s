# Práctica Calificada S11 | AP8: Persistencia y Comunicación Multi-componente en Kubernetes

Este repositorio implementa y orquesta una arquitectura desacoplada y reactiva de alta disponibilidad en **Kubernetes (Minikube)**. La solución integra un microservicio backend reactivo (**Spring WebFlux** con endpoints de salud Actuator), una base de datos NoSQL **MongoDB** con persistencia duradera mediante **PersistentVolumeClaim (PVC)**, externalización de configuración segura con **ConfigMaps** y **Secrets** (codificados en Base64), comunicación interna por DNS (**CoreDNS**) y aislamiento perimetral (**ClusterIP** vs. **NodePort**).

---

## 🏗️ Arquitectura General del Sistema

```text
+-------------------------------------------------------------------------------------------------------+
|                                           CLÚSTER KUBERNETES                                          |
|                                       (Namespace: practica-s11)                                       |
|                                                                                                       |
|    +-----------------------------+                         +-------------------------------------+    |
|    |  ConfigMap: app-configmap   |                         |          Secret: db-secret          |    |
|    |  - DB_HOST: mongo-service   |                         |  - MONGO_INITDB_ROOT_USERNAME       |    |
|    |  - DB_PORT: 27017           |                         |  - MONGO_INITDB_ROOT_PASSWORD       |    |
|    |  - DB_NAME: produccion_db   |                         |  (Type: Opaque, Base64 Encoded)     |    |
|    |  - APP_PORT: 8080           |                         +------------------+------------------+    |
|    +--------------+--------------+                                            |                       |
|                   |                                                           |                       |
|                   +---------------------------+   +---------------------------+                       |
|                                               |   | (envFrom)                                         |
|                                               v   v                                                   |
|    +---------------------------------------------------------------------------------------------+    |
|    | Deployment: backend-deployment (2 Réplicas)                                                 |    |
|    | Pods: backend-deployment-xxxx-xxxx (Spring WebFlux Reactive API)                              |    |
|    | - Puerto contenedor: 8080                                                                   |    |
|    | - Sondas de Salud Actuator:                                                                 |    |
|    |   • Liveness Probe:  http://:8080/actuator/health                                           |    |
|    |   • Readiness Probe: http://:8080/actuator/health                                           |    |
|    +------------------------------------------+--------------------------------------------------+    |
|                                               |                                                       |
|                                               | Comunicación TCP / Auth Interna (CoreDNS)             |
|                                               v mongo-service:27017                                   |
|    +---------------------------------------------------------------------------------------------+    |
|    | Service: mongo-service (Tipo: ClusterIP en Puerto 27017) -> Aislamiento de Red Estricto     |    |
|    +------------------------------------------+--------------------------------------------------+    |
|                                               |                                                       |
|                                               v                                                       |
|    +---------------------------------------------------------------------------------------------+    |
|    | Deployment: mongo-deployment (1 Réplica)                                                    |    |
|    | Pod: mongo-deployment-xxxx-xxxx (MongoDB 8.0)                                               |    |
|    | - Credenciales de arranque inyectadas desde db-secret y app-configmap                       |    |
|    | - Montaje de volumen duradero en /data/db                                                   |    |
|    +------------------------------------------+--------------------------------------------------+    |
|                                               |                                                       |
|                                               v (volumeMounts: /data/db)                              |
|    +---------------------------------------------------------------------------------------------+    |
|    | PersistentVolumeClaim: mongo-pvc (1Gi, ReadWriteOnce, Estado: Bound)                        |    |
|    | Supervivencia de datos garantizada ante reinicios o destrucción de Pods                     |    |
|    +---------------------------------------------------------------------------------------------+    |
|                                               ^                                                       |
|                                               | Tráfico entrante HTTP (30088 -> 8080)                 |
|    +------------------------------------------+                                                       |
|    | Service: backend-service (Tipo: NodePort en Puerto 30088)                                   |    |
+----+---------------------------------------------------------------------------------------------+----+
                                                |
                                                v
                                 Acceso Externo (Navegador / Cliente REST)
                           http://<minikube-ip>:30088  o  minikube service
```

---

## 📁 Estructura del Repositorio

```text
/
├── k8s/
│   ├── 00-namespace.yaml        # Aislamiento del entorno (practica-s11)
│   ├── 01-mongo-pvc.yaml        # PersistentVolumeClaim (1Gi, ReadWriteOnce)
│   ├── 02-app-configmap.yaml    # Configuración pública no sensible
│   ├── 03-db-secret.yaml        # Credenciales sensibles codificadas en Base64
│   ├── 04-mongo-stack.yaml      # Deployment de MongoDB (PVC /data/db) + Service ClusterIP
│   └── 05-backend-stack.yaml    # Deployment Spring WebFlux (envFrom + Actuator Probes) + Service NodePort
├── src/
│   ├── Dockerfile               # Empaquetado de contenedor ligero
│   ├── package.json             # Dependencias del servicio
│   ├── server.js                # API Reactiva + Actuator Health + UI de validación
│   └── .dockerignore
├── .gitignore
└── README.md                    # Documentación técnica completa
```

---

## 🔐 Matriz de Configuración y Seguridad

| Parámetro | Objeto Kubernetes | Clave | Clasificación | Valor Configurado |
| :--- | :--- | :--- | :--- | :--- |
| **Host de BD** | `ConfigMap` (`app-configmap`) | `DB_HOST` | Pública | `mongo-service` (CoreDNS) |
| **Puerto de BD** | `ConfigMap` (`app-configmap`) | `DB_PORT` | Pública | `27017` |
| **Nombre de BD** | `ConfigMap` (`app-configmap`) | `DB_NAME` | Pública | `produccion_db` |
| **Puerto App** | `ConfigMap` (`app-configmap`) | `APP_PORT` | Pública | `8080` |
| **Usuario Root BD** | `Secret` (`db-secret`) | `MONGO_INITDB_ROOT_USERNAME` | Confidencial (Base64) | `YWRtaW4=` (`admin`) |
| **Password Root BD** | `Secret` (`db-secret`) | `MONGO_INITDB_ROOT_PASSWORD` | Confidencial (Base64) | `TW9uZ29TZWN1cmUyMDI2IQ==` (`MongoSecure2026!`) |

---

## 🚀 Despliegue Paso a Paso en Minikube

```bash
# 1. Aplicar todos los manifiestos en orden secuencial
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-mongo-pvc.yaml
kubectl apply -f k8s/02-app-configmap.yaml
kubectl apply -f k8s/03-db-secret.yaml
kubectl apply -f k8s/04-mongo-stack.yaml
kubectl apply -f k8s/05-backend-stack.yaml
```

---

## 🔍 Comandos de Validación y Auditoría

### 1. Salud General del Clúster
```bash
kubectl get all,pvc,configmaps,secrets -n practica-s11
```

### 2. Validación de Persistencia y Volúmenes
```bash
kubectl describe pvc mongo-pvc -n practica-s11
```
*Certifica que el PVC se encuentra en estado `Bound` y asociado al Pod de MongoDB en `/data/db`.*

### 3. Inyección de Seguridad en el Backend
```bash
POD_NAME=$(kubectl get pods -n practica-s11 -l app=backend -o jsonpath="{.items[0].metadata.name}")
kubectl exec -it $POD_NAME -n practica-s11 -- env
```

### 4. Prueba de Conectividad Multi-componente y Sondas Actuator
```bash
# URL de acceso externo
minikube service backend-service -n practica-s11 --url

# Consulta del estado de salud (Actuator Health)
curl http://<url>/actuator/health

# Consulta reactiva de productos
curl http://<url>/api/productos
```
